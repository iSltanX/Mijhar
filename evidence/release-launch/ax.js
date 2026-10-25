// JXA (osascript -l JavaScript) لفحص زر مِجهَر في شريط أدوات متصفح من عائلة Chromium ولإرسال اختصاره، عبر واجهة الإتاحة في macOS لعملية بعينها
// (pid) مباشرة: AXUIElementCreateApplication(pid) وCGEventPostToPid. ولا يُستعمل System Events لأنه يحلّ العملية باسمها («Google Chrome»)
// فيصل إلى متصفح المستخدم المفتوح بالاسم نفسه. الأوامر:
//   dump <pid>             الأزرار في نوافذ العملية خارج محتوى الصفحة (للاستكشاف)
//   press <pid> <الاسم>    يضغط (AXPress) أول زر عنوانه أو وصفه يبدأ بالاسم، ويعيد ما ضُغط
//   keys <pid> <حرف>       ينشّط العملية نفسها، وإن صارت في المقدمة فعلًا يرسل Control+Shift+<حرف> إليها وحدها (CGEventPostToPid)
ObjC.import('ApplicationServices');
ObjC.import('AppKit');

const KEYCODES = { g: 5, k: 40 };

function value(el, name) {
  const ref = Ref();
  // أسماء السمات NSString لا نص JS (وإلا رُدّت kAXErrorIllegalArgument).
  const err = $.AXUIElementCopyAttributeValue(el, $(name), ref);
  if (err !== 0) return null;
  return ref[0];
}
const text = (el, name) => {
  const v = value(el, name);
  if (!v) return '';
  try {
    return String(ObjC.unwrap(ObjC.castRefToObject(v)) ?? '');
  } catch (e) {
    return '';
  }
};
const children = (el) => {
  const v = value(el, 'AXChildren');
  if (!v) return [];
  const arr = ObjC.castRefToObject(v);
  const out = [];
  for (let i = 0; i < arr.count; i += 1) out.push(arr.objectAtIndex(i));
  return out;
};

function buttons(pid) {
  const app = $.AXUIElementCreateApplication(pid);
  // Chromium يبني شجرة الإتاحة لواجهته حين يطلبها عميل إتاحة (كقارئ الشاشة).
  $.AXUIElementSetAttributeValue(app, $('AXManualAccessibility'), $.kCFBooleanTrue);
  $.AXUIElementSetAttributeValue(app, $('AXEnhancedUserInterface'), $.kCFBooleanTrue);
  delay(1);
  const found = [];
  const walk = (el, depth) => {
    if (depth > 14) return;
    for (const k of children(el)) {
      const role = text(k, 'AXRole');
      if (role === 'AXWebArea') continue;
      if (role === 'AXButton' || role === 'AXMenuButton' || role === 'AXPopUpButton') found.push({ el: k, depth, role, title: text(k, 'AXTitle'), desc: text(k, 'AXDescription') });
      walk(k, depth + 1);
    }
  };
  for (const w of children(app)) walk(w, 0);
  return found;
}

function run(argv) {
  const [cmd, pidText, arg] = argv;
  const pid = Number(pidText);
  if (cmd === 'dump') return buttons(pid).map((b) => `${b.depth} ${b.role} | ${b.title} | ${b.desc}`).join('\n');
  if (cmd === 'press') {
    const all = buttons(pid);
    const hit = all.find((b) => b.title.startsWith(arg) || b.desc.startsWith(arg));
    if (!hit) return JSON.stringify({ pressed: false, seen: all.map((b) => `${b.title}|${b.desc}`).slice(0, 40) });
    const err = $.AXUIElementPerformAction(hit.el, $('AXPress'));
    return JSON.stringify({ pressed: err === 0, err, role: hit.role, title: hit.title, desc: hit.desc });
  }
  if (cmd === 'keys') {
    const app = $.NSRunningApplication.runningApplicationWithProcessIdentifier(pid);
    if (!app || app.isNil()) return JSON.stringify({ sent: false, why: 'no-process' });
    app.activateWithOptions($.NSApplicationActivateIgnoringOtherApps);
    delay(0.8);
    const front = $.NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier;
    if (front !== pid) return JSON.stringify({ sent: false, frontPid: front });
    const code = KEYCODES[arg];
    const flags = $.kCGEventFlagMaskControl | $.kCGEventFlagMaskShift;
    const down = $.CGEventCreateKeyboardEvent($(), code, true);
    $.CGEventSetFlags(down, flags);
    const up = $.CGEventCreateKeyboardEvent($(), code, false);
    $.CGEventSetFlags(up, flags);
    $.CGEventPostToPid(pid, down);
    delay(0.05);
    $.CGEventPostToPid(pid, up);
    return JSON.stringify({ sent: true, frontPid: front });
  }
  return 'unknown';
}
