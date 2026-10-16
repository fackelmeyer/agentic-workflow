# Case: green tests that checked the wrong thing

From building my portfolio website with this workflow (October 2026).

**Task.** Browser tests for the website: accessibility (axe), rendering on phones, content without JavaScript. They are meant to run against the finished static build, exactly what goes live.

**What the agent built.** A Playwright configuration that starts a preview server on port 4321 before the tests and reuses a server already running there. All tests passed.

**The bug in it.** At the same time, the development server was running on port 4321. The tests reused it and checked the development state instead of the build. Green only meant: the development server is fine.

**How the process caught it.** Before anything counts as done, I check it in the browser. The screenshots of the supposedly built site showed the development server's toolbar, which does not exist in the build. Checking the port confirmed it.

**Outcome.** The tests now run on their own port and never reuse another server; a comment in the configuration records why. All tests were then run again against the build.

**Lesson.** Passing tests only prove something if it is clear what they checked. That is why "tests as a gate" in [the process](process.md) comes with "show the command and its result", and why UI work also gets a look in the browser.
