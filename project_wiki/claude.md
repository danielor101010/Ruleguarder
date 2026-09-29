---
name: senior-software-engineer
description: Enforces professional software engineering standards, strict git branching, automated testing, design-system fidelity, code quality, and Project Wiki (Brain) documentation. Use when designing, writing, testing, or refactoring code.
---

# Senior Software Engineer & AI-Assisted Development Standards

Whenever fulfilling coding requests, feature additions, bug fixes, or UI changes, you MUST adhere strictly to the following engineering standards, workflows, and documentation rules.

---

## 1. Project Wiki & Knowledge Base ("The Brain")
Maintain and expand the living knowledge base inside the existing `project_wiki/` folder at the root of the project. This serves as the project's brain, logging all architectural decisions, technical specs, and development progress.

- **Project Wiki Folder Structure (`/project_wiki`):**
  - `project_wiki/ARCH_DECISIONS.md`: Log Architecture Decision Records (ADRs) for major choices (e.g., Gemini integration, PDF/DOCX parsing engine, caching layer).
  - `project_wiki/DEVELOPMENT_LOG.md`: Chronological log of features built, bugs fixed, and active branch progress.
  - `project_wiki/PROMPT_PLAYBOOK.md`: Record of technical prompts, specs, and engineering instructions used during development.
  - `project_wiki/API_CONTRACTS.md`: Documented endpoints, Pydantic/TypeScript models, and response formats.
- **Auto-Update Rule:** Every time a feature, bugfix, or architectural change is completed, you MUST update or create the relevant `.md` files inside the `project_wiki/` folder to reflect the new state of the system before finalizing the task.

---

## 2. Git Workflow & Branching Strategy
- **NO Direct Commits to Main/Dev:** Never write or apply changes directly on `main`, `master`, or `dev` branches.
- **Feature Branch Naming:** Always instruct or create a new dedicated feature branch using the pattern:
  - `feature/<short-description>` (e.g., `feature/glassmorphism-ui-redesign`)
  - `fix/<short-description>` (e.g., `fix/jwt-token-expiration`)
  - `refactor/<short-description>`
- **Atomic & Conventional Commits:** Group changes cleanly. Use Conventional Commit messages: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `style:`.

---

## 3. Specification-First & Architecture
- **Spec First:** Before writing complex features, outline a quick Technical Plan (Architecture, Data Models, API Contracts, Constraints) and save or update it in `project_wiki/`.
- **Type Safety & Strict Contracts:**
  - TypeScript: Strict types, no implicit `any`, define explicit `interface` / `type` for API requests/responses.
  - Python: Use type hints (`mypy` compatible) and `Pydantic` models for data validation.
- **Clean Architecture & Separation of Concerns:** Keep UI components presentation-only, extract logic into custom hooks/services, and maintain clean API controllers.

---

## 4. UI/UX & Design System Rules
- **Design System Fidelity:** Follow the project's exact design language (Modern Glassmorphism / Tailwind CSS tokens).
- **Design Principles:**
  - Clean whitespace, modern hierarchy, and generous border-radii (`rounded-2xl` / `rounded-3xl`).
  - Subtle frosted glass panels (`backdrop-blur-md bg-white/70 border border-white/40`).
  - Dark accent buttons (`#0F172A` / `#000000`) with pill shapes (`rounded-full`).
- **Responsive & Accessible:** Ensure mobile responsiveness and accessible color contrast.

---

## 5. Automated Testing & Quality Assurance (Mandatory)
Every feature or code modification MUST be accompanied by corresponding automated tests:
- **Unit Tests:** Test individual components, hooks, functions, or utility classes (Vitest / Jest / Pytest).
- **Integration & API Tests:** Test API endpoints, data flow, and error states.
- **Edge Cases & Error Handling:** Include tests for unexpected inputs, missing data, network timeouts, and unauthorized requests.
- **Test Command Verification:** Always output the exact test execution command (e.g., `npm run test` or `pytest`) and ensure all tests pass before considering a task complete.

---

## 6. CI/CD & Code Hygiene
- **Zero Warnings:** Ensure code passes all static checks:
  - Linter (ESLint / Biome / Ruff)
  - Type-checker (`tsc --noEmit` / `mypy`)
- **No Console Leftovers:** Remove `console.log`, `print()` statements, or debug code before finishing.
- **Self-Review:** Perform an internal Code Review for potential memory leaks, security vulnerabilities, or performance bottlenecks.

---

## 7. How to Structure Responses & Output
When completing a task, organize your output logically:
1. **Branch & Scope:** State the active feature branch name.
2. **Implementation Summary:** Brief technical summary of what was built/modified.
3. **Tests Added:** Show newly added unit/integration tests and execution results.
4. **Project Wiki Updates:** List the updated/created Markdown files in the `project_wiki/` folder.
5. **Validation Command:** Provide the exact command to run the test suite and verify the build.