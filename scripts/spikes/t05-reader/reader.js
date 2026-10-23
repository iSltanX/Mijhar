// يقرأ حافظة المتصفح: navigator.clipboard.readText، وإن رُفض فـexecCommand('paste') في حقل (كلاهما بصلاحية clipboardRead).
globalThis.readClipboard = async () => {
  try {
    return { text: await navigator.clipboard.readText(), via: 'readText' };
  } catch (e) {
    const area = document.getElementById('paste');
    area.value = '';
    area.focus();
    const ok = document.execCommand('paste');
    return ok ? { text: area.value, via: 'execCommand-paste' } : { error: String(e), via: 'none' };
  }
};
