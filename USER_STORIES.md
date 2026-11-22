# TODO App — User Stories

**User:** me (the only user). I use the app mostly on my Android phone, sometimes on desktop.

Each story has:
- **Story:** As me, I want … so that …
- **How:** the exact taps/clicks to do it (📱 = phone, 🖥️ = desktop, where they differ)
- **Done when:** acceptance criteria (Given / When / Then)

Stories describe how the app **should** work. Where that differs from today, it's listed in *Known bugs & gaps* at the end.

---

## Epic 1 — Get into my data

### US-1.1 Sign in
**Story:** As me, I want to sign in with my email and password so that my tasks are the same on my phone and my desktop.

**How:**
1. Open the app.
2. Type email and password.
3. Tap **Sign In**.

**Done when:**
- Given I'm signed out, when I enter a correct email and password and tap Sign In, then the calendar opens showing today.
- Given I enter a wrong password, when I tap Sign In, then an error message appears and I stay on the sign-in screen.

### US-1.2 Stay signed in
**Story:** As me, I want to stay signed in so that I don't type my password every time I open the app.

**How:** Open the app — nothing else.

**Done when:**
- Given I signed in before, when I reopen the app, then the calendar opens without the sign-in screen.

### US-1.3 Sign out (desktop)
**Story:** As me, I want to sign out on desktop so that nobody else on that computer sees my tasks.

**How:** 🖥️ Click **🚪** in the top bar.

**Done when:**
- Given I'm signed in, when I click 🚪, then I'm back on the sign-in screen.

---

## Epic 2 — Plan my days

### US-2.1 See my days
**Story:** As me, I want to see my days side by side, grouped into weeks, so that I can see what's coming and plan ahead.

**How:** Open the app; scroll the calendar left/right (🖥️ also click-and-drag the background).

**Done when:**
- Given the app opens, then today is in view and highlighted.
- When I scroll to either end, then more weeks load automatically.

### US-2.2 Jump to today
**Story:** As me, I want one button to get back to today so that I never get lost scrolling.

**How:** Tap **Today** in the top bar.

**Done when:**
- Given I scrolled away, when I tap Today, then the calendar scrolls back to today.

### US-2.3 Name a week
**Story:** As me, I want to give a week a name so that I remember what that week is about (e.g. "Exam week").

**How:**
1. Tap the week label ("Week 47").
2. Type a name.
3. Press Enter or tap away. (Esc cancels.)

**Done when:**
- When I save a name, then it replaces "Week N" and is still there after reopening the app.

### US-2.4 Colour a day
**Story:** As me, I want to colour a day so that I can see at a glance which days are busy or special.

**How:**
- 🖥️ Ctrl+click the day header → pick a colour (or **✕ Clear**).
- 📱 Long-press the day header → pick a colour (or **✕ Clear**).

**Done when:**
- When I pick a colour, then the day shows that colour on every device.

### US-2.5 Scroll a busy day
**Story:** As me, I want a day with many tasks to scroll down so that I can reach every task and the **+** button.

**How:** Scroll up/down inside the day.

**Done when:**
- Given a day has more tasks than fit on screen, when I scroll inside that day, then I can reach the last task and the + button.
- Then the rest of the calendar doesn't move.

### US-2.6 See what's late
**Story:** As me, I want unfinished past tasks to look late so that I notice what I've been putting off.

**How:** Nothing — it's automatic.

**Done when:**
- Given a task is undone and its day has passed, then its border colour gets stronger the later it is.

### US-2.7 See due dates on the calendar
**Story:** As me, I want to see on each day what is due that day so that deadlines don't surprise me.

**How:** Nothing — it's automatic.

**Done when:**
- Given an undone task is due on a day, then a 📅 tag with its name shows in that day's header.
- Given it's overdue, then the tag is red.

---

## Epic 3 — Capture and manage tasks

### US-3.1 Add a task to a day
**Story:** As me, I want to add a task to a specific day quickly so that capturing it takes seconds.

**How:**
1. Tap **+** at the bottom of the day.
2. Type the name (optionally `#category` at the end).
3. Press Enter.
4. 🖥️ Shortcut: press **N** to add to today.

**Done when:**
- When I press Enter, then the task appears on that day and the edit menu does **not** open.
- Given I typed `#work`, then its category is "work".

### US-3.2 Tick a task done
**Story:** As me, I want to tick a task done so that I can see my progress.

**How:** Tap the task's checkbox.

**Done when:**
- When I tick it, then it shows as done and a "✅ Done!" toast appears.
- Then all its subtasks are done too.

### US-3.3 Undo a tick
**Story:** As me, I want to untick a task so that a mis-tap doesn't mess up my list.

**How:** Tap the checkbox again.

**Done when:**
- When I untick it, then only that task becomes undone — its subtasks keep their state.

### US-3.4 Move a task
**Story:** As me, I want to move a task to another day or reorder it so that my plan matches reality.

**How:**
- 🖥️ Drag the task to another day or position.
- 📱 Hold the task (~0.3 s, phone buzzes) → drag → let go.

**Done when:**
- When I drop it on another day, then it belongs to that day.
- When I drop it between two tasks, then it stays in that position after reopening the app.

### US-3.5 Break a task into subtasks
**Story:** As me, I want subtasks so that big tasks become manageable steps.

**How:**
- Tap **+ Add subtask** on the task → type → Enter.
- Or drag a task onto another task (📱 hold first).

**Done when:**
- Then the subtask shows inside its parent with a done/total count.
- Given I try to drop a task into its own subtask, then it snaps back.

### US-3.6 Collapse subtasks
**Story:** As me, I want to hide a task's subtasks so that the calendar stays tidy.

**How:** Tap **▸/▾** on the task.

**Done when:**
- When I tap it, then the subtasks hide or show everywhere that task appears.

### US-3.7 Edit a task
**Story:** As me, I want to change a task's details so that it stays accurate.

**How:**
1. Tap the task's name.
2. The edit menu opens (📱 without the keyboard popping up).
3. Tap the field I want to change.
4. Tap **Save** (or **Cancel**).

**Done when:**
- When I tap a task, then the edit menu opens and 📱 no keyboard appears until I tap a field.
- Then 📱 the edit menu fits the screen width with no sideways scrolling.
- Given it's a normal task, then I see: name, assigned day, due date, category, repeat, importance, urgency.
- Given it's a goal task, then I see no assigned day, no due date, no category, no importance/urgency, no repeat — and the title shows which goal it belongs to.
- Given it's a habit, then I see no assigned day, no due date, no repeat — and the title says "Edit Habit".

### US-3.8 Repeat a task
**Story:** As me, I want a task to come back on a schedule so that I don't re-type recurring chores.

**How:**
1. Open the task.
2. Pick **Repeat** (daily / weekdays / weekly / monthly).
3. Tap **Save**.

**Done when:**
- When I tick a repeating task done, then a fresh copy appears on the next date.

### US-3.9 Archive a task
**Story:** As me, I want to put finished or abandoned tasks away without deleting them so that the calendar stays clean but nothing is lost.

**How:**
1. Open the task.
2. Tap **📦 Archive**.

**Done when:**
- Then the task and its subtasks disappear from the calendar and show in the archive.

### US-3.10 Delete a task
**Story:** As me, I want to delete a task so that mistakes don't clutter my list.

**How:**
- 🖥️ Click **×** on the task → confirm. Or open the task → **🗑️ Delete** → confirm.
- 📱 Open the task → **🗑️ Delete** → confirm (no × on cards).

**Done when:**
- When I confirm, then the task and its subtasks are gone.
- Then 📱 I can't hit × by accident when aiming for another button.

---

## Epic 4 — Unscheduled work and deadlines

### US-4.1 Keep a backlog
**Story:** As me, I want a list of loose tasks without a day so that I can capture things now and schedule them later.

**How:**
1. Tap **☰**.
2. Tap **Backlog**.
3. To add: tap **Add to backlog** → type → Enter.

**Done when:**
- Then I see undated, unfinished loose tasks.
- Then I don't see any goal tasks or habits.

### US-4.2 Prioritise the backlog
**Story:** As me, I want to sort the backlog by importance or urgency so that I pick the right thing next.

**How:**
1. ☰ → **Backlog**.
2. Tap **⭐ Sort by Importance** or **⚡ Sort by Urgency**.

**Done when:**
- When I tap a sort, then the list reorders, and I can still drag to fine-tune.

### US-4.3 Schedule from the backlog
**Story:** As me, I want to drag a backlog task onto a day so that scheduling is one motion.

**How:**
1. ☰ → **Backlog**.
2. Hold the task (📱 ~0.3 s).
3. Pull it sideways — the menu gets out of the way.
4. Drop it on a day.

**Done when:**
- Then the task is on that day and gone from the backlog.

### US-4.4 See all deadlines
**Story:** As me, I want one list of everything that's due so that nothing slips.

**How:** ☰ → **Deadlines**.

**Done when:**
- Then unfinished tasks with a due date are grouped by date.
- Then goal tasks never appear here — deadlines are only for time-sensitive things.
- Then overdue ones are flagged and today's are marked.

### US-4.6 Unschedule a task
**Story:** As me, I want to take a task off the calendar without opening any menu so that rescheduling is easy.

**How:**
1. Hold a task on the calendar (📱 ~0.3 s).
2. A **Drop here → Backlog** strip appears.
3. Drop the task on it.

**Done when:**
- Given a normal task, then it moves to the backlog.
- Given it has a due date, then it stays in Deadlines as unscheduled.
- Given it's a goal task, then it stays in its goal (not in the backlog).
- Then a toast says where it went.

### US-4.5 Schedule a deadline
**Story:** As me, I want to drag a deadline onto a day so that I plan when I'll actually work on it.

**How:**
1. ☰ → **Deadlines**.
2. Hold an item — the menu closes.
3. Drop it on a day.

**Done when:**
- Then the task gets that day as its assigned day, and keeps its due date.

---

## Epic 5 — Work towards goals

### US-5.1 Create a goal
**Story:** As me, I want to create a goal with what "done" looks like and my notes/links so that I know what I'm working toward.

**How:**
1. ☰ → **Goals**.
2. Tap **+ New Goal**.
3. Fill in title, "What does done look like?" and links/notes.
4. Tap **Save**.

**Done when:**
- When I save, then the goal page opens.

### US-5.2 Paste a whole plan
**Story:** As me, I want to paste a written plan so that I don't build a big goal piece by piece.

**How:**
1. ☰ → **Goals**.
2. Tap **📋 Paste Plan**.
3. Paste the text and submit. The format is:
   - `# Goal`
   - `> done looks like`
   - `- subgoal` (indent to nest)
   - `* task` (add `@YYYY-MM-DD` to schedule it on a day)

**Done when:**
- When I submit valid text, then the goal, subgoals and tasks are created and the goal page opens.
- Given the text is invalid, then I get an error and nothing is created.

### US-5.3 See my goals at a glance
**Story:** As me, I want to see all goals and their progress so that I know where I stand.

**How:**
- ☰ → **Goals**.
- 🖥️ Or click the **🎯** pill in the top bar.

**Done when:**
- Then each goal shows a progress bar and when I last worked on it.

### US-5.4 Open a goal
**Story:** As me, I want to open a goal to see everything in it so that I can work on it.

**How:** ☰ → **Goals** → tap a goal card.

**Done when:**
- Then the goal page opens, showing:
  - what "done" looks like
  - **my notes/links**
  - progress
  - subgoals
  - tasks
- Then 🖥️ it's a side panel, so I can still see the calendar; 📱 it's full screen.

### US-5.5 Close a goal
**Story:** As me, I want to leave a goal page easily so that I get back to my calendar.

**How:**
- Tap **✕**.
- 📱 Or press the Android back button.
- Or tap outside the goal page.

**Done when:**
- Then the goal page closes and I'm back where I was.

### US-5.6 Add subgoals
**Story:** As me, I want to split a goal into subgoals (and sub-subgoals) so that it becomes concrete milestones.

**How:** On the goal page, tap **+ Add subgoal** (on the goal, or inside a subgoal) → type → Enter.

**Done when:**
- Then the subgoal appears in place.
- Then I can tell immediately that it's a subgoal and not a task.

### US-5.7 Add tasks to a goal
**Story:** As me, I want to add tasks to a goal or subgoal so that I know the next concrete action.

**How:** On the goal page, tap **+ Add task** (under the goal, or inside a subgoal) → type → Enter.

**Done when:**
- Then the task appears there and doesn't show up in the backlog.

### US-5.8 Reorganise a goal
**Story:** As me, I want to drag subgoals and tasks around so that the plan can change as I learn.

**How:** On the goal page, hold (📱 ~0.3 s) a subgoal or task → drag → drop.

**Done when:**
- When I drop a subgoal on another, then it nests.
- When I drop a task in another subgoal, then it moves there.
- Given a move would put a subgoal inside itself, then it snaps back.

### US-5.9 Schedule a goal task
**Story:** As me, I want to put a goal task on a specific day so that goals turn into real action.

**How:**
- Tap **📅** on the task → pick a date.
- Or 🖥️ drag the task from the goal page onto a day.

**Done when:**
- Then the task shows on that day and a "Scheduled for …" toast appears.
- Then the 📅 button stays inside its task card.

### US-5.10 Finish a subgoal
**Story:** As me, I want to tick a subgoal done so that progress goes up.

**How:** Tap the subgoal's checkbox.

**Done when:**
- Then the subgoal, its sub-subgoals and their tasks are done, and the progress bar updates.

### US-5.11 Rename or delete a subgoal
**Story:** As me, I want to rename or delete a subgoal so that the plan stays accurate.

**How:**
- Rename: tap its title → type → Enter.
- Delete: tap **×** → choose **Unlink (keep tasks)** or **Delete tasks too**.

**Done when:**
- Given I choose Unlink, then its tasks survive without the subgoal.
- Given I choose Delete tasks too, then they're gone as well.

### US-5.12 Edit or delete a goal
**Story:** As me, I want to change or remove a goal so that my goals stay current.

**How:** On the goal page, tap **✏️** → edit and tap **Save**, or tap **🗑️ Delete** → choose keep or delete its tasks.

**Done when:**
- Then the changes show immediately.

---

## Epic 6 — Build habits

### US-6.1 Make a habit
**Story:** As me, I want to mark something as a habit with an optional target (e.g. 2 per day) so that I can build routines.

**How:**
1. Open a task.
2. Tick **🔁 Make this a recurring habit**.
3. Optionally set the target count and Day/Week.
4. Tap **Save**.

**Done when:**
- Then the task shows a habit badge and appears in the Habits list (☰ → Goals).

### US-6.2 Log a habit
**Story:** As me, I want to log a habit each time I do it, even several times a day, so that my count is honest.

**How:** Tap the habit's **name or count**.

**Done when:**
- When I tap twice, then two separate logs are saved — the second is never blocked.

### US-6.3 Edit a habit
**Story:** As me, I want to edit a habit without accidentally logging it.

**How:** Tap the small **edit** button on the side of the habit.

**Done when:**
- Then the edit menu opens and no log is added.

### US-6.4 Undo a log
**Story:** As me, I want to undo only my last log so that one mis-tap doesn't wipe my day.

**How:** Tap **↩** on the habit.

**Done when:**
- Then only the most recent log is removed, and earlier logs that day stay.

### US-6.5 Log a past day
**Story:** As me, I want to log a habit on a day I forgot so that my history is complete.

**How:**
1. ☰ → **Goals**.
2. In **Habits**, hold the habit → pull sideways (the menu closes) → drop on the day.

**Done when:**
- Then a log is added for that day and a "Logged X for …" toast appears.
- Then the habit stays in the list.

### US-6.6 See my streak
**Story:** As me, I want to see my streak and total so that I stay motivated, without one bad day ruining it.

**How:** Look at the habit's badge: "🔥N streak · M total".

**Done when:**
- Given I miss one period, then the streak continues.
- Given I miss two in a row, then the streak resets — but the total never does.

### US-6.7 Gentle nudge
**Story:** As me, I want a gentle reminder when I haven't checked in so that I'm nudged, not shamed.

**How:** Nothing — it's automatic.

**Done when:**
- Given I missed the current and the previous period, then "check in?" shows, in a calm style and never red.
- Given the habit is brand new, then no nudge shows.

### US-6.8 See habits on the calendar
**Story:** As me, I want to see on each day which habits I did so that I can look back.

**How:** Nothing — it's automatic.

**Done when:**
- Then every day with a log shows the habit card with ×N for multiple logs.

---

## Epic 7 — Archive, search and backup (desktop)

### US-7.1 Browse the archive
**Story:** As me, I want to look through archived tasks so that I can find old work.

**How:**
1. 🖥️ Click **📦** in the top bar.
2. Open a #tag group, or type in the archive search box.

**Done when:**
- Then archived tasks are grouped by tag and searchable.

### US-7.2 Restore or remove archived tasks
**Story:** As me, I want to unarchive or permanently delete archived tasks so that the archive stays useful.

**How:** In the archive, click **Unarchive** or **Delete** on a task, or archive/unarchive a whole tag.

**Done when:**
- Then the task returns to the calendar, or is permanently gone.

### US-7.3 Search my tasks
**Story:** As me, I want to search my tasks so that I can find one fast.

**How:** 🖥️ Type in the search box in the top bar.

**Done when:**
- Then only matching tasks show, and they keep showing after the screen refreshes or syncs.

### US-7.4 Back up and restore
**Story:** As me, I want to export and import a backup file so that I never lose my data.

**How:** 🖥️ Click **Export** to save a file; click **Import** and pick the file to restore.

**Done when:**
- Then the export includes tasks, colours, goals and subgoals.
- Then importing never deletes anything before the new data is written.

---

## Epic 8 — Use it comfortably on my phone

### US-8.1 Open the menu
**Story:** As me, I want a big, easy-to-hit menu button on the right so that I can reach it with my thumb.

**How:** 📱 Tap **☰** (top right).

**Done when:**
- Then the menu slides in from the right — the same side as the button.

### US-8.2 Uncluttered top bar
**Story:** As me, I want the top bar to show only what I use on the phone so that I never scroll sideways in it.

**How:** Nothing — it's automatic.

**Done when:**
- Then the phone top bar shows only ☰, Today and 📦 Archive — no search, import, export, goals pill or sign out.
- Then there's no hints bar at the bottom.

### US-8.3 Back button
**Story:** As me, I want the Android back button to close whatever is open so that I can escape anything quickly.

**How:** 📱 Press back.

**Done when:**
- Given the edit menu is open, then back closes it.
- Else given a goal page is open, then back closes it.
- Else given the menu is open, then back closes it.
- Given nothing is open, then back leaves the app.

### US-8.4 Tap outside to close
**Story:** As me, I want to tap outside any menu or popup to close it so that escaping is effortless.

**How:** Tap the dimmed area outside.

**Done when:**
- Then the menu or popup closes without saving unsaved edits.

### US-8.5 Buttons I can hit
**Story:** As me, I want every button big enough for my finger so that I don't mis-tap.

**How:** Nothing — it's automatic.

**Done when:**
- Then every tappable thing is at least about 44×44 px.
- Then no two buttons' tap areas overlap.

### US-8.6 Nothing spills out
**Story:** As me, I want everything to stay inside its box so that the screen never looks broken.

**How:** Nothing — it's automatic.

**Done when:**
- Then no button sticks out of its card.
- Then no screen scrolls sideways.

---

## Phone only vs both

| Change | Where |
|---|---|
| Back button closes things (US-8.3) | 📱 only |
| ☰ on the right, bigger, menu from the right (US-8.1) | 📱 only |
| Trimmed top bar, no hints bar (US-8.2) | 📱 only |
| No keyboard when opening a task (US-3.7) | 📱 only |
| Bigger buttons (US-8.5) | 📱 only |
| Edit menu fits the screen (US-3.7) | 📱 only |
| Tap outside closes (US-8.4, US-5.5) | Both |
| 📅 stays inside its card (US-5.9) | Both |
| Subgoal vs task visually distinct (US-5.6) | Both |
| Goal tasks: no dates, no category (US-3.7) | Both |
| Habits: no dates (US-3.7) | Both |
| Goal notes/links on goal page (US-5.4) | Both |
| Goal tasks not in backlog (US-4.1) | Both |
| Habit: tap logs, small edit button (US-6.2, 6.3) | Both |
| Busy day scrolls (US-2.5) | Both |

---

## Known bugs & gaps (today vs the stories)

| Story | Today |
|---|---|
| US-8.3 | Back always minimises the app — the Android side can't see the app's code. |
| US-4.1 / 5.7 | Undated goal tasks show in the backlog. |
| US-5.4 | Goal notes/links are saved but never shown. |
| US-5.6 | Subgoals and tasks look too alike. |
| US-5.9 | 📅 button sticks out of its card; 📱 the × tap area overlaps it. |
| US-2.5 | Busy days probably get cut off instead of scrolling (needs a real test). |
| US-3.7 | 📱 Keyboard pops up immediately; edit menu scrolls sideways; goal tasks still show category and dates; habits still show dates. |
| US-6.2 / 6.3 | Tapping a habit's name opens edit; logging is the + button. |
| US-8.1 / 8.2 / 8.5 | ☰ on the left and small; top bar scrolls; many buttons too small. |
| US-2.4 | Day colour only opens with Ctrl+click — impossible on the phone. |
| US-7.3 | Search filter is lost when the screen refreshes. |
| US-5.5 / 8.4 | 🖥️ No tap-outside to close the goal page. |

## Decisions (from review)

1. Repeat is hidden on habits and goal tasks. ✅ accepted
2. Quick-add never opens the edit menu afterwards. ✅ accepted
3. Goal progress keeps counting subgoals only. ❌ ignored
4. A task dropped in the backlog keeps its due date (stays in Deadlines as unscheduled) and keeps its goal. ✅ accepted
5. Collapsing a subgoal hides its tasks too. ✅ accepted
6. 📱 Delete lives in the edit menu; no × on cards. ✅ accepted
7. Edit menu title says "Edit Habit" / shows the goal. ✅ accepted

Answers: goal tasks have **no** dates at all; no sign out on the phone; no import/export on the phone, archive stays; day colour on the phone by long-press.
