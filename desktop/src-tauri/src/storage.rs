use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{fs, io::Write, path::{Path, PathBuf}, time::{SystemTime, UNIX_EPOCH}};
use tempfile::NamedTempFile;
use uuid::Uuid;

pub type Result<T> = std::result::Result<T, String>;
const MAX_BYTES: usize = 100 * 1024 * 1024;

#[derive(Serialize)]
pub struct BoardFile { pub name: String, pub modified: u64 }
#[derive(Serialize)]
pub struct LoadedBoard { pub name: String, pub content: String, pub revision: String }
#[derive(Serialize)]
pub struct SavedBoard { pub name: String, pub revision: String, pub conflict: bool }

pub fn hash(content: &str) -> String { format!("{:x}", Sha256::digest(content.as_bytes())) }
fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64 }
fn io(e: impl std::fmt::Display) -> String { e.to_string() }

pub fn valid_name(name: &str) -> Result<()> {
    let stem = name.strip_suffix(".excalidraw").ok_or("文件须以 .excalidraw 结尾")?;
    let base = stem.split('.').next().unwrap_or("").to_ascii_uppercase();
    if stem.is_empty() || name.len() > 180 || stem.trim() != stem || stem.ends_with('.') ||
        name.chars().any(|c| c.is_control() || "<>:\"/\\|?*".contains(c)) || stem.starts_with('.') ||
        ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"].contains(&base.as_str()) {
        return Err("文件名包含不允许的字符、保留名称，或过长".into());
    }
    Ok(())
}

pub fn validate_board(content: &str) -> Result<()> {
    if content.len() > MAX_BYTES { return Err("画布超过 100 MB，请拆分后保存".into()); }
    let v: Value = serde_json::from_str(content).map_err(io)?;
    if v.get("type").and_then(Value::as_str) != Some("excalidraw") || !v.get("elements").is_some_and(Value::is_array) {
        return Err("不是有效的 Excalidraw 画布".into());
    }
    Ok(())
}

/// Tempfile is created on the same volume. persist replaces atomically on Windows and Unix.
pub fn atomic_write(path: &Path, content: &str) -> Result<()> {
    let parent = path.parent().ok_or("无效路径")?;
    fs::create_dir_all(parent).map_err(io)?;
    let mut temp = NamedTempFile::new_in(parent).map_err(io)?;
    temp.write_all(content.as_bytes()).map_err(io)?;
    temp.as_file().sync_all().map_err(io)?;
    temp.persist(path).map_err(io)?;
    Ok(())
}

pub struct Storage { pub root: Option<PathBuf>, pub data: PathBuf }

impl Storage {
    pub fn new(data: PathBuf) -> Result<Self> {
        fs::create_dir_all(data.join("recovery")).map_err(io)?;
        let config = data.join("directory.json");
        let root = if config.exists() {
            let text = fs::read_to_string(config).map_err(io)?;
            let raw: String = serde_json::from_str(&text).map_err(io)?;
            Some(PathBuf::from(raw))
        } else { None };
        Ok(Self { root, data })
    }

    pub fn select(&mut self, path: PathBuf) -> Result<()> {
        let path = path.canonicalize().map_err(io)?;
        if !path.is_dir() { return Err("请选择文件夹".into()); }
        atomic_write(&self.data.join("directory.json"), &serde_json::to_string(&path).map_err(io)?)?;
        self.root = Some(path);
        Ok(())
    }

    fn path(&self, name: &str) -> Result<PathBuf> {
        valid_name(name)?;
        let root = self.root.as_ref().ok_or("请先选择画布文件夹")?.canonicalize().map_err(io)?;
        let path = root.join(name);
        if let Ok(meta) = fs::symlink_metadata(&path) {
            if meta.file_type().is_symlink() || !meta.is_file() { return Err("不支持链接或非普通文件".into()); }
            #[cfg(windows)] {
                use std::os::windows::fs::MetadataExt;
                // Reject reparse points that redirect paths (symlinks/junctions). OneDrive
                // cloud placeholders are allowed after canonical parent confinement below.
                if meta.file_attributes() & 0x400 != 0 && path.canonicalize().map_err(io)?.parent() != Some(root.as_path()) {
                    return Err("文件不在已授权目录内".into());
                }
            }
            if path.canonicalize().map_err(io)?.parent() != Some(root.as_path()) { return Err("文件不在已授权目录内".into()); }
        }
        Ok(path)
    }

    fn read_text(path: &Path) -> Result<String> {
        if fs::metadata(path).map_err(io)?.len() > MAX_BYTES as u64 { return Err("文件超过 100 MB".into()); }
        fs::read_to_string(path).map_err(io)
    }

    pub fn list(&self) -> Result<Vec<BoardFile>> {
        let root = self.root.as_ref().ok_or("请先选择画布文件夹")?;
        let mut files = Vec::new();
        for entry in fs::read_dir(root).map_err(io)? {
            let entry = entry.map_err(io)?;
            let name = entry.file_name().to_string_lossy().to_string();
            if valid_name(&name).is_ok() && self.path(&name).is_ok() {
                let modified = entry.metadata().map_err(io)?.modified().map_err(io)?.duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64;
                files.push(BoardFile { name, modified });
            }
        }
        files.sort_by(|a,b| b.modified.cmp(&a.modified).then(a.name.cmp(&b.name)));
        Ok(files)
    }

    pub fn read(&self, name: &str) -> Result<LoadedBoard> {
        let content = Self::read_text(&self.path(name)?)?;
        validate_board(&content)?;
        Ok(LoadedBoard {name: name.into(), revision:hash(&content), content})
    }

    /// Keep the latest 20 distinct states per directory+board outside the sync folder.
    pub fn backup(&self, name: &str, content: &str) -> Result<()> {
        valid_name(name)?;
        validate_board(content)?;
        let key = hash(&format!("{:?}/{}", self.root, name));
        let folder = self.data.join("recovery").join(&key);
        fs::create_dir_all(&folder).map_err(io)?;
        let mut entries: Vec<_> = fs::read_dir(&folder).map_err(io)?.filter_map(|e| e.ok()).filter(|e| e.path().extension().is_some_and(|x| x == "excalidraw")).collect();
        entries.sort_by_key(|e| e.file_name());
        if let Some(last) = entries.last() {
            if fs::read_to_string(last.path()).ok().as_deref() == Some(content) { return Ok(()); }
        }
        // Multiple snapshots in one millisecond must still sort chronologically.
        let previous_time = entries.last().and_then(|e| e.file_name().to_str().and_then(|s|s.split('-').next()?.parse::<u64>().ok())).unwrap_or(0);
        let timestamp = now().max(previous_time.saturating_add(1));
        atomic_write(&folder.join(format!("{}-{}.excalidraw", timestamp, Uuid::new_v4())), content)?;
        atomic_write(&folder.join("name.json"), &serde_json::to_string(name).map_err(io)?)?;
        let remove_count = entries.len().saturating_sub(19);
        for entry in entries.into_iter().take(remove_count) { fs::remove_file(entry.path()).map_err(io)?; }
        Ok(())
    }

    pub fn save(&self, name: &str, content: &str, expected: Option<&str>) -> Result<SavedBoard> {
        validate_board(content)?;
        self.backup(name, content)?;
        let path = self.path(name)?;
        let existing = if path.exists() { Some(Self::read_text(&path)?) } else { None };
        let revision = existing.as_deref().map(hash);
        let conflict = revision.as_deref() != expected;
        let (target, actual_name) = if conflict {
            let short_name: String = name.trim_end_matches(".excalidraw").chars().take(24).collect();
            let machine: String = std::env::var("COMPUTERNAME").or_else(|_| std::env::var("HOSTNAME")).unwrap_or_else(|_| "device".into()).chars().filter(|c| c.is_ascii_alphanumeric()).take(16).collect();
            let copy = format!("{}-conflict-{}-{}-{}.excalidraw", short_name, machine, now(), &Uuid::new_v4().to_string()[..8]);
            (self.path(&copy)?, copy)
        } else { (path, name.into()) };
        if let Some(old) = existing {
            // A corrupt external file is still preserved at its original path.
            // It must not prevent a valid conflict copy from being saved.
            if validate_board(&old).is_ok() { self.backup(name, &old)?; }
        }
        self.backup(name, content)?;
        atomic_write(&target, content)?;
        Ok(SavedBoard { name: actual_name, revision: hash(content), conflict })
    }

    pub fn rename(&self, name: &str, new_name: &str, expected: &str) -> Result<()> {
        if name == new_name { return Ok(()); }
        let current = self.read(name)?;
        if current.revision != expected { return Err("文件已被外部修改，请重新打开后重命名".into()); }
        let target = self.path(new_name)?;
        if target.exists() { return Err("目标文件已存在".into()); }
        self.backup(name, &current.content)?;
        // hard_link is atomic and fails if target already exists, unlike rename on Unix.
        let source = self.path(name)?;
        fs::hard_link(&source, &target).map_err(io)?;
        fs::remove_file(source).map_err(io)?;
        Ok(())
    }

    pub fn trash(&self, name: &str, expected: &str) -> Result<()> {
        let current = self.read(name)?;
        if current.revision != expected { return Err("文件已被外部修改，请重新打开后删除".into()); }
        self.backup(name, &current.content)?;
        fs::remove_file(self.path(name)?).map_err(io)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const A: &str = r#"{"type":"excalidraw","elements":[],"appState":{}}"#;
    const B: &str = r#"{"type":"excalidraw","elements":[],"appState":{"viewBackgroundColor":"red"}}"#;
    fn setup() -> (tempfile::TempDir, Storage) {
        let temp = tempfile::tempdir().unwrap();
        let mut storage = Storage::new(temp.path().join("settings")).unwrap();
        fs::create_dir(temp.path().join("boards")).unwrap();
        storage.select(temp.path().join("boards")).unwrap();
        (temp, storage)
    }
    #[test] fn save_conflict_and_roundtrip() {
        let (_temp,s) = setup();
        let first = s.save("测试.excalidraw", A, None).unwrap();
        assert!(!first.conflict);
        assert_eq!(s.read(&first.name).unwrap().content, A);
        let second = s.save(&first.name, B, Some(&first.revision)).unwrap();
        assert!(!second.conflict);
        let conflict = s.save(&first.name, A, Some(&first.revision)).unwrap();
        assert!(conflict.conflict);
        assert_eq!(s.read(&first.name).unwrap().content, B);
        assert_eq!(s.read(&conflict.name).unwrap().content, A);
    }
    #[test] fn refuses_traversal_reserved_names_and_bad_data() {
        let (_temp,s) = setup();
        for name in ["../a.excalidraw", "C:\\x.excalidraw", "a/b.excalidraw", "CON.excalidraw", ".excalidraw", "x.json"] { assert!(s.save(name,A,None).is_err()); }
        assert!(s.save("a.excalidraw", "{}", None).is_err());
        assert!(s.list().unwrap().is_empty());
    }
    #[test] fn rename_delete_and_recovery() {
        let (_temp,s) = setup();
        let a = s.save("a.excalidraw", A, None).unwrap();
        s.save("b.excalidraw", B, None).unwrap();
        assert!(s.rename("a.excalidraw","b.excalidraw",&a.revision).is_err());
        s.rename("a.excalidraw","c.excalidraw",&a.revision).unwrap();
        assert!(s.trash("c.excalidraw","wrong").is_err());
        s.trash("c.excalidraw",&a.revision).unwrap();
        assert!(s.read("c.excalidraw").is_err());
        assert!(fs::read_dir(s.data.join("recovery")).unwrap().count() > 0);
    }
    #[test] fn settings_survive_new_instance() {
        let (_temp,s) = setup();
        atomic_write(&s.data.join("settings.json"), "{\"version\":1}").unwrap();
        let next = Storage::new(s.data.clone()).unwrap();
        assert_eq!(next.root,s.root);
        assert!(next.data.join("settings.json").exists());
    }
    #[test] fn recovery_remains_available_when_directory_is_missing() {
        let (_temp, s) = setup();
        fs::remove_dir(s.root.as_ref().unwrap()).unwrap();
        assert!(s.save("draft.excalidraw", A, None).is_err());
        let folder=fs::read_dir(s.data.join("recovery")).unwrap().next().unwrap().unwrap().path();
        assert!(fs::read_dir(folder).unwrap().any(|e|fs::read_to_string(e.unwrap().path()).ok().as_deref()==Some(A)));
    }
    #[test] fn recovery_is_ordered_bounded_and_keeps_latest() {
        let (_temp, s) = setup();
        for index in 0..30 {
            let content=format!(r#"{{"type":"excalidraw","elements":[],"sequence":{index}}}"#);
            s.backup("a.excalidraw", &content).unwrap();
        }
        let folder=fs::read_dir(s.data.join("recovery")).unwrap().next().unwrap().unwrap().path();
        let mut files:Vec<_>=fs::read_dir(folder).unwrap().map(|e|e.unwrap().path()).filter(|p|p.extension().is_some_and(|x|x=="excalidraw")).collect();
        files.sort();
        assert_eq!(files.len(),20);
        let latest:Value=serde_json::from_str(&fs::read_to_string(files.last().unwrap()).unwrap()).unwrap();
        assert_eq!(latest["sequence"],29);
    }
    #[test] fn corrupt_external_file_is_preserved_and_local_content_saved_as_copy() {
        let (_temp, s) = setup();
        let first=s.save("a.excalidraw",A,None).unwrap();
        fs::write(s.root.as_ref().unwrap().join("a.excalidraw"),"external invalid JSON").unwrap();
        let copy=s.save("a.excalidraw", B, Some(&first.revision)).unwrap();
        assert!(copy.conflict);
        assert_eq!(s.read(&copy.name).unwrap().content,B);
        assert_eq!(fs::read_to_string(s.root.as_ref().unwrap().join("a.excalidraw")).unwrap(),"external invalid JSON");
    }
}
