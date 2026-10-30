import AppKit
import WebKit
import UniformTypeIdentifiers

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    private var window: NSWindow!
    private var web: WKWebView!
    private var config: DesktopConfig!
    private var host: Process?
    private var inputPipe: Pipe?
    private var outputPipe: Pipe?
    private var log: FileHandle?
    private var base: URL?
    private var ready = false
    private var quitting = false
    private var terminationPending = false
    private var generation = 0
    private var output = Data()
    private var loading: NSTextField!
    private var destinations: [ObjectIdentifier: (temporary: URL, final: URL)] = [:]

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenus()
        let configuration = WKWebViewConfiguration()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.autoresizingMask = [.width, .height]
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1240, height: 820),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "TutorTrack"
        window.minSize = NSSize(width: 780, height: 560)
        window.delegate = self
        window.isReleasedWhenClosed = false
        window.center()
        window.setFrameAutosaveName("TutorTrackMainWindow")
        let content = NSView(frame: NSRect(x: 0, y: 0, width: 1240, height: 820))
        window.contentView = content
        web.frame = content.bounds
        content.addSubview(web)
        loading = NSTextField(labelWithString: "Opening your teaching workspace…")
        loading.font = .systemFont(ofSize: 18, weight: .medium)
        loading.translatesAutoresizingMaskIntoConstraints = false
        content.addSubview(loading)
        NSLayoutConstraint.activate([loading.centerXAnchor.constraint(equalTo: content.centerXAnchor), loading.centerYAnchor.constraint(equalTo: content.centerYAnchor)])
        showWindow()
        do {
            guard let url = Bundle.main.url(forResource: "DesktopConfig", withExtension: "json") else {
                throw NSError(domain: "TutorTrack", code: 1, userInfo: [NSLocalizedDescriptionKey: "The app configuration is missing. Rebuild with python3 desktop/build.py."])
            }
            config = try JSONDecoder().decode(DesktopConfig.self, from: Data(contentsOf: url))
            startHost()
        } catch { showStartupError(error.localizedDescription) }
    }

    private func buildMenus() {
        let menu = NSMenu()
        let appItem = NSMenuItem(); menu.addItem(appItem)
        let appMenu = NSMenu(); appItem.submenu = appMenu
        appMenu.addItem(withTitle: "About TutorTrack", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        add(appMenu, "Show TutorTrack", #selector(showWindow), "0")
        appMenu.addItem(withTitle: "Hide TutorTrack", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit TutorTrack", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let fileItem = NSMenuItem(); menu.addItem(fileItem)
        let fileMenu = NSMenu(title: "File"); fileItem.submenu = fileMenu
        add(fileMenu, "Save Note", #selector(saveNote), "s")
        add(fileMenu, "Show Data Folder", #selector(showData), "")
        fileMenu.addItem(.separator())
        fileMenu.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        let editItem = NSMenuItem(); menu.addItem(editItem)
        let edit = NSMenu(title: "Edit"); editItem.submenu = edit
        for (title, selector, key) in [("Undo", "undo:", "z"), ("Redo", "redo:", "Z"), ("Cut", "cut:", "x"), ("Copy", "copy:", "c"), ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")] {
            edit.addItem(withTitle: title, action: Selector(selector), keyEquivalent: key)
        }
        let viewItem = NSMenuItem(); menu.addItem(viewItem)
        let viewMenu = NSMenu(title: "View"); viewItem.submenu = viewMenu
        add(viewMenu, "Reload", #selector(reload), "r")
        add(viewMenu, "Zoom In", #selector(zoomIn), "+")
        add(viewMenu, "Zoom Out", #selector(zoomOut), "-")
        add(viewMenu, "Actual Size", #selector(resetZoom), "")
        viewMenu.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "")
        NSApp.mainMenu = menu
    }

    private func add(_ menu: NSMenu, _ title: String, _ action: Selector, _ key: String) {
        let item = menu.addItem(withTitle: title, action: action, keyEquivalent: key)
        item.target = self
    }

    @objc func showWindow() { window?.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true) }
    @objc func showData() {
        if let config { NSWorkspace.shared.open(URL(fileURLWithPath: config.project + "/data", isDirectory: true)) }
    }
    @objc func saveNote() {
        web.evaluateJavaScript("if (typeof route !== 'undefined' && route === 'notes' && selectedNote !== null) { saveNote(); }")
    }
    @objc func zoomIn() { web.pageZoom = min(2, web.pageZoom + 0.1) }
    @objc func zoomOut() { web.pageZoom = max(0.7, web.pageZoom - 0.1) }
    @objc func resetZoom() { web.pageZoom = 1 }
    @objc func reload() {
        guard ready else { if config != nil { startHost() }; return }
        allowLeaving { allowed in
            if allowed { self.web.evaluateJavaScript("if (typeof dirty !== 'undefined') dirty = false;") { _,_ in self.web.reload() } }
        }
    }

    private func startHost() {
        guard let config else { return }
        if let message = config.validationError() { showStartupError(message); return }
        stopHost()
        generation += 1
        let current = generation
        ready = false; base = nil; output = Data()
        web.isHidden = true; loading.isHidden = false
        loading.stringValue = "Opening your teaching workspace…"
        do {
            let logURL = URL(fileURLWithPath: config.project + "/data/desktop.log")
            try FileManager.default.createDirectory(at: logURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            if !FileManager.default.fileExists(atPath: logURL.path) { FileManager.default.createFile(atPath: logURL.path, contents: nil) }
            log = try FileHandle(forWritingTo: logURL)
            try log?.seekToEnd()
            let process = Process(), incoming = Pipe(), outgoing = Pipe()
            process.executableURL = URL(fileURLWithPath: config.python)
            process.arguments = [config.project + "/desktop/host.py"]
            process.currentDirectoryURL = URL(fileURLWithPath: config.project)
            var environment = ProcessInfo.processInfo.environment
            environment["PYTHONUNBUFFERED"] = "1"
            environment["TUTORTRACK_DATA"] = config.project + "/data"
            process.environment = environment
            process.standardInput = incoming; process.standardOutput = outgoing; process.standardError = log
            host = process; inputPipe = incoming; outputPipe = outgoing
            outgoing.fileHandleForReading.readabilityHandler = { [weak self] handle in
                let chunk = handle.availableData
                if chunk.isEmpty { handle.readabilityHandler = nil; return }
                DispatchQueue.main.async {
                    guard let self, current == self.generation, !self.ready else { return }
                    self.output.append(chunk)
                    guard let lineEnd = self.output.firstIndex(of: 10) else { return }
                    do {
                        guard let value = try JSONSerialization.jsonObject(with: self.output.prefix(upTo: lineEnd)) as? [String: Any],
                              let address = value["url"] as? String, let url = URL(string: address),
                              url.host == "127.0.0.1", url.scheme == "http", let port = url.port, port > 0, port <= 65535 else {
                            throw NSError(domain: "TutorTrack", code: 2, userInfo: [NSLocalizedDescriptionKey: "The local server returned an invalid address."])
                        }
                        self.ready = true; self.base = url
                        self.web.load(URLRequest(url: url))
                    } catch { self.showStartupError(error.localizedDescription) }
                }
            }
            process.terminationHandler = { [weak self] process in
                DispatchQueue.main.async {
                    guard let self, current == self.generation, !self.quitting else { return }
                    self.showStartupError("The local server stopped (code \(process.terminationStatus)). Check data/desktop.log in your project for details.")
                }
            }
            try process.run()
            DispatchQueue.main.asyncAfter(deadline: .now()+15) { [weak self] in
                guard let self, current == self.generation, !self.ready, !self.quitting else { return }
                self.showStartupError("The local server did not start in time. Check data/desktop.log, then try again.")
            }
        } catch { showStartupError(error.localizedDescription) }
    }

    private func stopHost() {
        generation += 1
        host?.terminationHandler = nil
        outputPipe?.fileHandleForReading.readabilityHandler = nil
        try? inputPipe?.fileHandleForWriting.close()
        // EOF lets the bridge cleanly stop its own server, or simply leave a reused server alone.
        host = nil; inputPipe = nil; outputPipe = nil
        try? log?.close(); log = nil
    }

    private func showStartupError(_ message: String) {
        stopHost(); ready = false
        loading?.isHidden = false; loading?.stringValue = "TutorTrack could not start."
        let alert = NSAlert(); alert.messageText = "Couldn’t open TutorTrack"; alert.informativeText = message
        alert.addButton(withTitle: "Try Again"); alert.addButton(withTitle: "Quit")
        alert.beginSheetModal(for: window) { response in
            if response == .alertFirstButtonReturn && self.config != nil { self.startHost() }
            else { self.quitting = true; NSApp.terminate(nil) }
        }
    }

    private func allowLeaving(_ completion: @escaping (Bool) -> Void) {
        web.evaluateJavaScript("typeof dirty !== 'undefined' && dirty") { result, error in
            guard (result as? Bool) == true || (error != nil && self.ready) else { completion(true); return }
            let alert = NSAlert(); alert.messageText = "Leave without saving your note?"
            alert.informativeText = "Use Save Note (⌘S) first to keep your latest changes."
            alert.addButton(withTitle: "Keep Editing"); alert.addButton(withTitle: "Discard Changes")
            alert.beginSheetModal(for: self.window) { completion($0 == .alertSecondButtonReturn) }
        }
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if quitting { return .terminateNow }
        if terminationPending { return .terminateCancel }
        terminationPending = true
        showWindow()
        allowLeaving { allowed in
            self.terminationPending = false
            if allowed { self.quitting = true; self.stopHost() }
            NSApp.reply(toApplicationShouldTerminate: allowed)
        }
        return .terminateLater
    }
    func applicationWillTerminate(_ notification: Notification) { stopHost() }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { showWindow(); return true }
    func windowShouldClose(_ sender: NSWindow) -> Bool { sender.orderOut(nil); return false } // Keep the webview and unsaved note alive.

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loading.isHidden = true; web.isHidden = false; window.makeFirstResponder(web) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { showStartupError(error.localizedDescription) }
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        let alert = NSAlert(); alert.messageText = "The app window stopped responding"
        alert.informativeText = "Saved records are safe. Unsaved note text may have been lost. Reload to continue."
        alert.addButton(withTitle: "Reload")
        alert.beginSheetModal(for: window) { _ in self.web.reload() }
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url, let base else { decisionHandler(.cancel); return }
        if WindowPolicy.isInternal(url, base: base) {
            if navigationAction.shouldPerformDownload || ["/api/backup", "/api/export"].contains(url.path) {
                decisionHandler(.download)
            } else if navigationAction.targetFrame?.isMainFrame == true && WindowPolicy.requiresUnsavedCheck(url, current: web.url) {
                allowLeaving { decisionHandler($0 ? .allow : .cancel) }
            } else { decisionHandler(.allow) }
        } else {
            if navigationAction.navigationType == .linkActivated && WindowPolicy.canOpenExternally(url) { NSWorkspace.shared.open(url) }
            decisionHandler(.cancel)
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        let disposition = (navigationResponse.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition") ?? ""
        decisionHandler(disposition.lowercased().contains("attachment") || !navigationResponse.canShowMIMEType ? .download : .allow)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = navigationAction.request.url, let base else { return nil }
        if WindowPolicy.isInternal(url, base: base) { web.load(navigationAction.request) }
        else if WindowPolicy.canOpenExternally(url) { NSWorkspace.shared.open(url) }
        return nil
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert(); alert.messageText = "TutorTrack"; alert.informativeText = message; alert.addButton(withTitle: "OK")
        alert.beginSheetModal(for: window) { _ in completionHandler() }
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert(); alert.messageText = "TutorTrack"; alert.informativeText = message
        alert.addButton(withTitle: "Continue"); alert.addButton(withTitle: "Cancel")
        alert.beginSheetModal(for: window) { completionHandler($0 == .alertFirstButtonReturn) }
    }
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel(); panel.canChooseDirectories = false; panel.canChooseFiles = true
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.allowedContentTypes = [.png, .jpeg, .gif, .webP]
        panel.beginSheetModal(for: window) { completionHandler($0 == .OK ? panel.urls : nil) }
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel(); panel.nameFieldStringValue = (suggestedFilename as NSString).lastPathComponent
        panel.canCreateDirectories = true
        panel.beginSheetModal(for: window) { result in
            guard result == .OK, let final = panel.url else { completionHandler(nil); return }
            // WebKit requires a destination that does not exist. Move only after success.
            let temporary = final.deletingLastPathComponent().appendingPathComponent(".tutortrack-\(UUID().uuidString).download")
            self.destinations[ObjectIdentifier(download)] = (temporary, final)
            completionHandler(temporary)
        }
    }
    func downloadDidFinish(_ download: WKDownload) {
        guard let item = destinations.removeValue(forKey: ObjectIdentifier(download)) else { return }
        do {
            if FileManager.default.fileExists(atPath: item.final.path) {
                _ = try FileManager.default.replaceItemAt(item.final, withItemAt: item.temporary)
            } else { try FileManager.default.moveItem(at: item.temporary, to: item.final) }
        } catch { reportDownloadError(error) }
    }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let item = destinations.removeValue(forKey: ObjectIdentifier(download)) { try? FileManager.default.removeItem(at: item.temporary) }
        if (error as NSError).code != NSURLErrorCancelled { reportDownloadError(error) }
    }
    private func reportDownloadError(_ error: Error) {
        let alert = NSAlert(); alert.messageText = "Couldn’t save the download"; alert.informativeText = error.localizedDescription
        alert.beginSheetModal(for: window)
    }
}

@main struct TutorTrackApplication {
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        withExtendedLifetime(delegate) { app.run() }
    }
}
