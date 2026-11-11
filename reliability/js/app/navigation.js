// Moving around the legacy page from the new code: open a link in the Links tab.

/** Set by openLinkInReview, read once by the Links tab when it mounts. */
export const pendingLink = { id: null, status: null };

/** Switch to Asset Registry > Links with this link selected. Returns false if the page cannot navigate. */
export function openLinkInReview(linkId, status = 'proposed') {
  pendingLink.id = linkId;
  pendingLink.status = status;
  return Boolean(window.NexusReliability?.go('registry', 'Links'));
}
