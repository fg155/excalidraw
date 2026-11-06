fn main() {
    println!("cargo:rerun-if-changed=src/tablet_macos.m");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos")
        && std::env::var_os("CARGO_FEATURE_DESKTOP").is_some()
    {
        cc::Build::new()
            .file("src/tablet_macos.m")
            .flag("-fobjc-arc")
            .flag("-fblocks")
            .flag("-fobjc-exceptions")
            .compile("tablet_input");
        println!("cargo:rustc-link-lib=framework=AppKit");
    }
    #[cfg(feature = "desktop")]
    tauri_build::build()
}
