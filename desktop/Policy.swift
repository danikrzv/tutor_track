import Foundation

struct DesktopConfig: Codable {
    let project: String
    let python: String

    func validationError() -> String? {
        let fm = FileManager.default
        guard project.hasPrefix("/"), fm.fileExists(atPath: project + "/desktop/host.py"),
              fm.fileExists(atPath: project + "/server.py") else {
            return "The TutorTrack project could not be found at:\n\(project)\n\nRestore that folder or rebuild the app from its new location."
        }
        guard fm.isExecutableFile(atPath: python) else {
            return "Python could not be found at:\n\(python)\n\nRestore your Python installation or rebuild the app with python3 desktop/build.py."
        }
        return nil
    }
}

enum WindowPolicy {
    static func isInternal(_ url: URL, base: URL) -> Bool {
        url.scheme == "http" && url.host == "127.0.0.1" && url.port == base.port &&
            url.user == nil && url.password == nil
    }
    static func canOpenExternally(_ url: URL) -> Bool {
        ["https", "http", "mailto"].contains(url.scheme?.lowercased() ?? "") && url.user == nil && url.password == nil
    }
    static func requiresUnsavedCheck(_ destination: URL, current: URL?) -> Bool {
        guard let current else { return false }
        if ["/api/backup", "/api/export"].contains(destination.path) { return false }
        let destinationPath = destination.path.isEmpty ? "/" : destination.path
        let currentPath = current.path.isEmpty ? "/" : current.path
        if destination.fragment != nil && destinationPath == currentPath && destination.query == current.query { return false }
        return true
    }
}
