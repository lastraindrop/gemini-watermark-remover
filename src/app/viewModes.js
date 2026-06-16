/**
 * v2.6: View mode helpers.
 * switchViewMode, setupSlider, updateStatsUI removed — #singlePreview section
 * (comparisonSlider, sideBySideView, statsView, tierBadge, magnifier) is
 * deleted in favour of the unified card grid layout.
 * Only applyProfileTheme is retained — it colors the header icon per-profile.
 */
export function applyProfileTheme(profile) {
    if (!profile?.brandColor) return;
    const headerIcon = document.querySelector('[data-profile-icon]');
    if (headerIcon) {
        headerIcon.style.backgroundColor = profile.brandColor;
        headerIcon.dataset.appliedColor = profile.brandColor;
    }
}
