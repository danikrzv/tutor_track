import Foundation

@main struct PolicyTests {
    static func main() throws {
        let base = URL(string: "http://127.0.0.1:43210")!
        assert(WindowPolicy.isInternal(URL(string: "http://127.0.0.1:43210/api/backup")!, base: base))
        assert(!WindowPolicy.isInternal(URL(string: "http://127.0.0.1:43211/")!, base: base))
        assert(!WindowPolicy.isInternal(URL(string: "http://127.0.0.1.evil.test:43210/")!, base: base))
        assert(!WindowPolicy.isInternal(URL(string: "http://name@127.0.0.1:43210/")!, base: base))
        assert(!WindowPolicy.isInternal(URL(string: "file:///etc/passwd")!, base: base))
        assert(WindowPolicy.canOpenExternally(URL(string: "https://example.com/lesson")!))
        assert(!WindowPolicy.canOpenExternally(URL(string: "javascript:alert(1)")!))
        assert(!WindowPolicy.canOpenExternally(URL(string: "file:///tmp/anything")!))
        assert(WindowPolicy.requiresUnsavedCheck(URL(string: "http://127.0.0.1:43210/")!, current: base))
        assert(!WindowPolicy.requiresUnsavedCheck(URL(string: "http://127.0.0.1:43210/#notes")!, current: base))
        assert(!WindowPolicy.requiresUnsavedCheck(URL(string: "http://127.0.0.1:43210/api/backup")!, current: base))
        assert(!WindowPolicy.requiresUnsavedCheck(base, current: nil))
        let missing = DesktopConfig(project: "/missing-project", python: "/missing-python")
        assert(missing.validationError() != nil)
        print("Desktop policy checks passed: origin isolation, external links, and startup validation.")
    }
}
