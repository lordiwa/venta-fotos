# Tasks

Local task store for the hivemind workflow. Each task is a JSON file conforming to the schema below.

## Fields

- `key`: Task identifier (e.g. TASK-001)
- `title`: Short description
- `description`: Longer description
- `acceptance_criteria`: List of specific, testable criteria
- `status`: todo | in_progress | in_review | done
- `priority`: low | medium | high | critical
- `labels`: Categorization tags
- `assignee`: Responsible agent
- `depends_on`: List of task keys this task depends on
- `linked_commits`: SHAs of related commits
- `linked_prs`: URLs or IDs of related PRs
- `comments`: Array of {author, at (ISO-8601), body}
- `created_at` / `updated_at`: ISO-8601 timestamps
- `jira_key`: Future Jira key (null until migrated)