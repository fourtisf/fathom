import { Icon } from '../Icon';

/** Stays until a lawyer signs off on the legal text (CLAUDE.md §13.5). */
export function DraftBanner() {
  return (
    <div className="draft">
      <Icon name="info" />
      Draft. Pending legal review before launch.
    </div>
  );
}
