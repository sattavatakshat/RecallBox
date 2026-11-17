# RB-12 physical Android QA

Use the actual connected physical phone serial instead of `USB_SERIAL`. No emulator is required. Reuse your existing compatible development build. Start the API using `bash scripts/run-local.sh api` and Metro using `npm --prefix apps/mobile start -- --port 8081` in separate terminals if they are not already running.

```sh
adb devices -l
adb -s USB_SERIAL shell pm path app.recallbox.mobile
adb -s USB_SERIAL reverse tcp:8001 tcp:8001
adb -s USB_SERIAL reverse tcp:8081 tcp:8081
adb -s USB_SERIAL shell am start -a android.intent.action.VIEW -d 'app.recallbox.mobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081' app.recallbox.mobile
```

If a native rebuild is required, explicitly target the phone: from `apps/mobile`, run `npm run android -- --device USB_SERIAL --no-bundler`.

1. Open Collections in OS light mode. Compare compact layout, official logo/wordmark, initials/account action, colors and row geometry with the reference.
2. Switch OS dark mode. Check ivory text, forest background, lime accents, icon surfaces and navigation contrast.
3. Compare header and navigation with Library; avatar opens Account & Settings.
4. Use an account without collections: one first-collection action, no sample names, no empty-state flash during loading.
5. Tap New collection: input autofocus, keyboard-safe Create/Cancel and readable title.
6. Cancel via Cancel, backdrop and Android Back: nothing created; hub name retained when reopened.
7. Create a duplicate with case differences: clear error and editable draft, no extra collection.
8. Test whitespace-only, exactly 80 characters, over 80, emoji and trimmed names.
9. Simulate API loss (stop API or remove reverse for tcp:8001; Wi-Fi alone may leave USB API reachable). Create: draft retained, no false success. Restore API/reverse, Check collections, then retry only if no match exists. Also test response loss after server commit: matched collection opens without another POST.
10. Confirm successful creation closes the sheet and opens the real Collection Detail.
11. Create without adding anything: empty collection remains visible and Detail offers Add saved items.
12. Verify 0 saved items, 1 saved item, and plural counts against real memberships, including a memory in multiple collections.
13. Scroll the hub, open Detail and return using Android Back and Back to collections. Loaded rows and position persist.
14. Rename in Detail; return and confirm the new name without scroll reset.
15. Cancel deletion once, then confirm deletion: hub updates and underlying memories remain in Library.
16. In RB-11 Organize, edit topic/tags, create a collection, verify it is selected in the draft and the other edits remain. Save applies membership. Cancel/discard preserves independently created collection. Check retry after a creation failure.
17. Hub floating + opens RB-04 Save. Confirm it saves a memory, while New collection creates a collection.
18. Switch Library/Search/Collections repeatedly: correct active tabs, one bar/FAB, no duplicate route stack.
19. Test a long real collection name at large font/display settings; rows/header grow without hiding text or actions.
20. Test keyboard open/close, Android Back, TalkBack reading order and focus restoration after dismissing creation, gesture navigation and three-button navigation.
21. Scroll a long real list to its end: stable order, last row remains reachable above FAB. At 100 collections, Create gives an accurate limit message. Exceptional `has_more` data shows an honest notice.
22. Fail initial and subsequent list fetches: retryable error; previously confirmed rows remain with an outdated-list message; pull-to-refresh recovers. Remove a collection from another session and refresh.
23. Sign out/switch accounts during and after loading/creation: no previous account collections/draft visible to the next account.
