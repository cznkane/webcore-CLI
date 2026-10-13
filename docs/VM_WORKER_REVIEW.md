# VM worker security review

The new policy module is not an execution worker. Production management remains read-only. Before enabling test execution, implement a separate non-admin worker, trusted release integrity verification, independent one-use approvals, authenticated local IPC, strict path permissions, bounded execution, process-tree cleanup, audit logging, and Windows integration tests. No deployment to TERMINAL is authorized by this PR.
