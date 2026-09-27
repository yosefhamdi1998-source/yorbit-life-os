import { isNative } from '@/lib/platform';

// Saves a generated file (CSV, PDF, JSON export).
//
// In a browser this is an ordinary download. In the iOS app an <a download>
// click does nothing: Capacitor treats the blob: URL as an outside navigation,
// cancels it and hands it to iOS, which cannot open it. So on native the file
// is written to the app's cache and offered through the share sheet, where
// "Save to Files", AirDrop and Mail all work.
//
// Resolves true once the file was handed over, false if the person dismissed
// the share sheet (not an error). Anything else rejects.
export async function saveFile(blob, filename) {
  if (!isNative()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);
  const { uri } = await Filesystem.writeFile({ path: filename, data: await toBase64(blob), directory: Directory.Cache });
  try {
    await Share.share({ title: filename, url: uri });
  } catch (err) {
    if (/cancel/i.test(String(err?.message ?? err))) return false;
    throw err;
  }
  return true;
}

async function toBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // Chunked: spreading a large export's bytes in one call overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
