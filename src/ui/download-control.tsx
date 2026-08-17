import { ChevronDown, Download, ExternalLink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { projectDownloadUrl } from '../domain/tracking';
import type { DownloadAsset, TrackedProject } from '../domain/types';
import { pickBestAsset } from '../platform/downloader';
import { formatBytes } from './format';
import { useMenuFocus } from './keyboard-accessibility';

// The app auto-picks the asset a plain Download starts; the UI mirrors that
// pick so the caption names the file the user is about to get. Null means no
// asset in the release can run on this platform.
export function pickPrimaryAsset(assets: DownloadAsset[]): DownloadAsset | null {
  return pickBestAsset(assets);
}

export type ProjectInstallState = 'none' | 'downloading' | 'in-library';

interface ProjectDownloadControlProps {
  project: TrackedProject;
  installState: ProjectInstallState;
  // True when App wired the real-download handler; without it every project
  // falls back to opening its release page.
  realDownloads: boolean;
  primaryClassName?: string;
  onDownloadProject?(project: TrackedProject): void;
  onDownloadAsset?(project: TrackedProject, asset: DownloadAsset): void;
  tabIndex?: number;
}

// Download affordance for one tracked project. A project with real release
// assets gets a Download button whose accessible label includes project, file, and size, with
// the auto-picked asset named beside it; multiple assets get a Steam-style
// menu that starts a specific file. Projects without assets fall back to an
// honestly-labeled link to the release page.
export function ProjectDownloadControl({
  project,
  installState,
  realDownloads,
  primaryClassName = 'download-action',
  onDownloadProject,
  onDownloadAsset,
  tabIndex,
}: ProjectDownloadControlProps) {
  const assets = project.downloadAssets;
  const primary = pickPrimaryAsset(assets);
  const downloadLabel = primary
    ? `Download ${project.projectName}, ${primary.name}${
        primary.sizeBytes !== null ? `, ${formatBytes(primary.sizeBytes)}` : ''
      }`
    : `Download ${project.projectName}`;

  if (installState === 'downloading') {
    return (
      <button
        aria-label={downloadLabel}
        className={primaryClassName}
        disabled
        tabIndex={tabIndex}
        type="button"
      >
        <Download aria-hidden="true" size={12} />
        Downloading…
      </button>
    );
  }

  // Only offer Download when something here can actually run on this machine.
  // Falling back to assets[0] would cheerfully hand a Linux AppImage to a
  // Windows player; the release page is the honest answer instead.
  if (primary && realDownloads && onDownloadProject) {
    const chosen = primary;
    return (
      <div className="download-control">
        <div className="download-control-actions">
          <button
            aria-label={downloadLabel}
            className={primaryClassName}
            tabIndex={tabIndex}
            type="button"
            onClick={() => onDownloadProject(project)}
          >
            <Download aria-hidden="true" size={12} />
            Download
          </button>
          {assets.length > 1 && onDownloadAsset ? (
            <AssetMenu
              assets={assets}
              tabIndex={tabIndex}
              onPick={(asset) => onDownloadAsset(project, asset)}
            />
          ) : null}
        </div>
        <span className="download-control-asset">
          {chosen.name}
          {chosen.sizeBytes !== null ? ` · ${formatBytes(chosen.sizeBytes)}` : ''}
        </span>
      </div>
    );
  }

  const releasePage = projectDownloadUrl(project);
  if (releasePage) {
    return (
      <a
        aria-label={`Open ${project.projectName} release page`}
        className={`${primaryClassName} download-action-link`}
        href={releasePage}
        rel="noreferrer"
        tabIndex={tabIndex}
        target="_blank"
      >
        <ExternalLink aria-hidden="true" size={12} />
        Release page
      </a>
    );
  }

  return null;
}

interface AssetMenuProps {
  assets: DownloadAsset[];
  onPick(asset: DownloadAsset): void;
  tabIndex?: number;
}

function AssetMenu({ assets, onPick, tabIndex }: AssetMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const { closeAndRestore, menuRef, onMenuKeyDown } = useMenuFocus<HTMLUListElement>(
    open,
    () => setOpen(false),
    { returnFocusTo: toggleRef.current },
  );

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => {
      document.removeEventListener('mousedown', close);
    };
  }, [open]);

  return (
    <div className="download-menu-wrap" ref={wrapRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Choose download file"
        className="download-menu-toggle"
        ref={toggleRef}
        tabIndex={tabIndex}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <ChevronDown aria-hidden="true" size={12} />
      </button>
      {open ? (
        <ul className="download-menu" ref={menuRef} role="menu" onKeyDown={onMenuKeyDown}>
          {assets.map((asset) => (
            <li key={asset.url} role="none">
              <button
                className="download-menu-item"
                role="menuitem"
                type="button"
                onClick={() => {
                  closeAndRestore();
                  onPick(asset);
                }}
              >
                <span className="download-menu-name">
                  {asset.name}
                </span>
                <span className="download-menu-size">
                  {asset.sizeBytes !== null ? formatBytes(asset.sizeBytes) : '—'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
