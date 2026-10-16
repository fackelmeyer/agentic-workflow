---
paths:
  - "**/*.dart"
  - "**/pubspec.yaml"
---
# Flutter app testing

- To launch, inspect, tap, type into, screenshot or E2E-test a Flutter app, use the `flutter-skill` MCP tools (`launch_app`, `inspect`, `tap`, `swipe`, `enter_text`, `wait_for_element`, `screenshot`, `get_logs`, `hot_reload`, `stop_app`). Do not use the Dart MCP (`mcp__dart__*`) for app testing: it has no UI automation. Never mix the two in one workflow.
- Launch with `extra_args: ["--vm-service-port=50000"]`. Flutter 3.x defaults to DTD; the VM service flag is required. Errors like "Found DTD URI but no VM Service URI" or "getVM method not found" mean this flag is missing, not that you should switch tools.
- The Dart MCP stays the right tool for analysis, pub, and non-app tasks.
