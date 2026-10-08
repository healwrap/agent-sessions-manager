/// Read the bundled image directly so a local update does not reuse macOS's
/// cached application icon in the Dock and standard About panel.
pub fn apply() {
    #[cfg(target_os = "macos")]
    {
        use objc2::AnyThread;
        use objc2_app_kit::{NSApplication, NSImage};
        use objc2_foundation::NSData;
        let main = objc2::MainThreadMarker::new().expect("应用图标需在主线程设置");
        // Keep all native icon sizes, rather than overriding the bundle with a
        // single bitmap that macOS also uses in the application switcher.
        let data = NSData::with_bytes(include_bytes!("../icons/icon.icns"));
        if let Some(image) = NSImage::initWithData(NSImage::alloc(), &data) {
            // The setter is called on the main thread with a valid, non-null image.
            unsafe { NSApplication::sharedApplication(main).setApplicationIconImage(Some(&image)); }
        }
    }
}
