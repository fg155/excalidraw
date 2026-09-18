use crate::storage::{self, BoardFile, LoadedBoard, SavedBoard, Storage};
use serde::Serialize;
use serde_json::Value;
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{Manager, State};

type Result<T> = storage::Result<T>;
struct AppStorage(Mutex<Storage>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Context { directory: Option<PathBuf>, data_directory: PathBuf, settings: Option<String> }

#[tauri::command]
fn get_context(state: State<AppStorage>) -> Result<Context> {
    let s = state.0.lock().map_err(|e| e.to_string())?;
    let path = s.data.join("settings.json");
    let settings = if path.exists() { Some(fs::read_to_string(path).map_err(|e|e.to_string())?) } else { None };
    Ok(Context { directory: s.root.clone(), data_directory:s.data.clone(), settings })
}

#[tauri::command]
async fn choose_directory(app: tauri::AppHandle) -> Result<Option<PathBuf>> {
    let chosen = tauri::async_runtime::spawn_blocking(|| rfd::FileDialog::new().set_title("选择画布文件夹（可选择 OneDrive 中的文件夹）").pick_folder()).await.map_err(|e|e.to_string())?;
    if let Some(path) = chosen {
        let state = app.state::<AppStorage>();
        let mut s = state.0.lock().map_err(|e|e.to_string())?;
        s.select(path)?;
        Ok(s.root.clone())
    } else { Ok(None) }
}

#[tauri::command]
fn list_boards(state: State<AppStorage>) -> Result<Vec<BoardFile>> { state.0.lock().map_err(|e|e.to_string())?.list() }
#[tauri::command]
fn read_board(name: String, state: State<AppStorage>) -> Result<LoadedBoard> { state.0.lock().map_err(|e|e.to_string())?.read(&name) }
#[tauri::command]
fn save_board(name: String, content: String, revision: Option<String>, state: State<AppStorage>) -> Result<SavedBoard> { state.0.lock().map_err(|e|e.to_string())?.save(&name,&content,revision.as_deref()) }
#[tauri::command]
fn backup_board(name: String, content: String, state: State<AppStorage>) -> Result<()> { state.0.lock().map_err(|e|e.to_string())?.backup(&name,&content) }
#[tauri::command]
fn rename_board(name: String, new_name: String, revision: String, state: State<AppStorage>) -> Result<()> { state.0.lock().map_err(|e|e.to_string())?.rename(&name,&new_name,&revision) }
#[tauri::command]
fn trash_board(name: String, revision: String, state: State<AppStorage>) -> Result<()> { state.0.lock().map_err(|e|e.to_string())?.trash(&name,&revision) }

fn settings_json(content: &str) -> Result<Value> {
    if content.len() > 128 * 1024 { return Err("设置文件过大".into()); }
    let value: Value = serde_json::from_str(content).map_err(|e|e.to_string())?;
    if !value.is_object() || value.get("version").and_then(Value::as_u64) != Some(1) { return Err("无效的设置版本".into()); }
    Ok(value)
}

#[tauri::command]
fn save_settings(content: String, state: State<AppStorage>) -> Result<()> {
    settings_json(&content)?;
    let s = state.0.lock().map_err(|e|e.to_string())?;
    let path = s.data.join("settings.json");
    if path.exists() {
        let old = fs::read_to_string(&path).map_err(|e|e.to_string())?;
        storage::atomic_write(&s.data.join("settings.previous.json"), &old)?;
    }
    storage::atomic_write(&path,&content)
}

#[tauri::command]
async fn import_settings() -> Result<Option<String>> {
    tauri::async_runtime::spawn_blocking(|| {
        match rfd::FileDialog::new().add_filter("设置", &["json"]).pick_file() {
            Some(path) => {
                if fs::metadata(&path).map_err(|e|e.to_string())?.len() > 128*1024 { return Err("设置文件过大".into()); }
                fs::read_to_string(path).map(Some).map_err(|e|e.to_string())
            }, None => Ok(None)
        }
    }).await.map_err(|e|e.to_string())?
}

#[tauri::command]
async fn export_settings(content: String) -> Result<bool> {
    settings_json(&content)?;
    tauri::async_runtime::spawn_blocking(move || {
        match rfd::FileDialog::new().add_filter("设置", &["json"]).set_file_name("excalidraw-settings.json").save_file() {
            Some(path) => { storage::atomic_write(&path,&content)?; Ok(true) }, None => Ok(false)
        }
    }).await.map_err(|e|e.to_string())?
}

#[tauri::command]
async fn import_board() -> Result<Option<String>> {
    tauri::async_runtime::spawn_blocking(|| {
        match rfd::FileDialog::new().add_filter("Excalidraw 画布", &["excalidraw"]).pick_file() {
            Some(path) => {
                if fs::metadata(&path).map_err(|e|e.to_string())?.len() > 100*1024*1024 { return Err("画布超过 100 MB".into()); }
                let content = fs::read_to_string(path).map_err(|e|e.to_string())?;
                storage::validate_board(&content)?;
                Ok(Some(content))
            }, None => Ok(None)
        }
    }).await.map_err(|e|e.to_string())?
}

#[derive(Serialize)]
struct Recovery { id:String, name:String, modified:u64 }

#[tauri::command]
fn list_recovery(state: State<AppStorage>) -> Result<Vec<Recovery>> {
    let s = state.0.lock().map_err(|e|e.to_string())?;
    let mut result = vec![];
    for dir in fs::read_dir(s.data.join("recovery")).map_err(|e|e.to_string())? {
        let dir = dir.map_err(|e|e.to_string())?;
        if !dir.file_type().map_err(|e|e.to_string())?.is_dir() { continue; }
        let name = fs::read_to_string(dir.path().join("name.json")).ok().and_then(|v|serde_json::from_str::<String>(&v).ok()).unwrap_or_else(||"恢复画布.excalidraw".into());
        for entry in fs::read_dir(dir.path()).map_err(|e|e.to_string())? {
            let entry = entry.map_err(|e|e.to_string())?;
            if entry.path().extension().is_some_and(|x|x=="excalidraw") {
                let filename=entry.file_name().to_string_lossy().to_string();
                result.push(Recovery { id:format!("{}/{}",dir.file_name().to_string_lossy(),filename), name:name.clone(), modified:filename.split('-').next().and_then(|x|x.parse().ok()).unwrap_or(0) });
            }
        }
    }
    result.sort_by(|a,b|b.modified.cmp(&a.modified));
    Ok(result)
}

#[tauri::command]
fn read_recovery(id: String, state: State<AppStorage>) -> Result<String> {
    let s=state.0.lock().map_err(|e|e.to_string())?;
    let parts:Vec<_>=id.split('/').collect();
    if parts.len()!=2 || parts[0].len()!=64 || !parts[0].bytes().all(|c|c.is_ascii_hexdigit()) || !parts[1].ends_with(".excalidraw") || !parts[1].bytes().all(|c|c.is_ascii_hexdigit() || b"-.excalidrw".contains(&c)) { return Err("无效的恢复记录".into()); }
    let root=s.data.join("recovery").canonicalize().map_err(|e|e.to_string())?;
    let path=root.join(parts[0]).join(parts[1]).canonicalize().map_err(|e|e.to_string())?;
    if !path.starts_with(root) { return Err("无效的恢复路径".into()); }
    let content=fs::read_to_string(path).map_err(|e|e.to_string())?;
    storage::validate_board(&content)?;
    Ok(content)
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let storage = Storage::new(app.path().app_data_dir()?).map_err(std::io::Error::other)?;
            app.manage(AppStorage(Mutex::new(storage)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_context,choose_directory,list_boards,read_board,save_board,backup_board,rename_board,trash_board,save_settings,import_settings,export_settings,import_board,list_recovery,read_recovery])
        .run(tauri::generate_context!())
        .expect("Failed to run Excalidraw Personal");
}
