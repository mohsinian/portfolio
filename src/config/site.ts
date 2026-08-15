/**
 * CV settings — the only place you touch when your CV changes.
 *
 * Option 1 (recommended): paste your Google Drive share link below.
 *   - In Drive, share the file as "Anyone with the link – Viewer",
 *     otherwise visitors hit a permission wall.
 *   - Any of these link shapes works, the file ID is extracted for you:
 *       https://drive.google.com/file/d/FILE_ID/view?usp=sharing
 *       https://drive.google.com/open?id=FILE_ID
 *       https://drive.google.com/uc?export=download&id=FILE_ID
 *   - Tip: if you replace the file in Drive (same file ID), the link
 *     never changes and you don't need to touch this file at all.
 *
 * Option 2 (fallback, active while the link is empty): the site serves
 * the local copy at public/Tahsin_Ahmed_Majumder_CV.pdf. To update,
 * replace that file and redeploy.
 */
export const CV_DRIVE_LINK = "";

const PLACEHOLDER = "PASTE_YOUR_LINK_HERE";

function extractDriveFileId(link: string): string | null {
  if (!link || link === PLACEHOLDER) return null;
  const patterns = [
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,})/,
    /[?&]id=([a-zA-Z0-9_-]{10,})/,
  ];
  for (const pattern of patterns) {
    const match = link.match(pattern);
    if (match) return match[1];
  }
  return null;
}

const fileId = extractDriveFileId(CV_DRIVE_LINK);

export const cv = fileId
  ? {
      mode: "drive" as const,
      // Opens Drive's built-in viewer
      view: `https://drive.google.com/file/d/${fileId}/view`,
      // Forces the PDF to download directly
      download: `https://drive.google.com/uc?export=download&id=${fileId}`,
    }
  : { mode: "local" as const, view: "/Tahsin_Ahmed_Majumder_CV.pdf", download: "/Tahsin_Ahmed_Majumder_CV.pdf" };

export const cvIsConfigured = cv.mode !== "none";
