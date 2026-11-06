import { Fragment } from 'react';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function searchWords(search: string): string[] {
  return [...new Set(search.trim().split(/\s+/).filter(Boolean))].slice(0, 6);
}

/** True when the value contains the whole search or any of its words (case-insensitive). */
export function textMatches(value: string | null | undefined, search: string): boolean {
  if (!value || !search.trim()) return false;
  const haystack = value.toLocaleLowerCase('en-US');
  const phrase = search.trim().toLocaleLowerCase('en-US');
  return (
    haystack.includes(phrase) ||
    searchWords(phrase).some((word) => haystack.includes(word.toLocaleLowerCase('en-US')))
  );
}

/** Finds the first labelled value that matches, preferring whole-phrase matches. */
export function firstMatch(
  candidates: Array<{ label: string; value: string | null | undefined }>,
  search: string,
): { label: string; value: string } | null {
  if (!search.trim()) return null;
  const phrase = search.trim().toLocaleLowerCase('en-US');
  const present = candidates.filter((candidate): candidate is { label: string; value: string } =>
    Boolean(candidate.value),
  );
  return (
    present.find((candidate) => candidate.value.toLocaleLowerCase('en-US').includes(phrase)) ??
    present.find((candidate) => textMatches(candidate.value, search)) ??
    null
  );
}

export function HighlightText({ text, search }: { text: string; search: string }) {
  const words = searchWords(search);
  if (!words.length || !text) return <>{text}</>;
  const pattern = new RegExp(`(${words.map(escapeRegex).join('|')})`, 'gi');
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark className="search-mark" key={index}>
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function openAncestorFolders(element: HTMLElement): void {
  for (
    let folder = element.parentElement?.closest('details');
    folder;
    folder = folder.parentElement?.closest('details')
  ) {
    folder.open = true;
  }
}

/**
 * Opens the folders around the first visible element with one of the ids, scrolls to it and
 * briefly flashes it. Retries a few times because folders may still be rendering.
 */
export function revealElement(ids: string[], attempts = 6): boolean {
  for (const id of ids) {
    const element = document.getElementById(id);
    if (!element) continue;
    openAncestorFolders(element);
    if (!element.offsetParent) continue;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.classList.remove('search-flash');
    void element.offsetWidth;
    element.classList.add('search-flash');
    return true;
  }
  if (attempts > 1) window.setTimeout(() => revealElement(ids, attempts - 1), 80);
  return false;
}
