import type { BoundingBox, Region } from "@/lib/regions";

// "Gaps between adjacent box edges" — for each region, the distance to its
// nearest neighbor along whichever axis they're aligned on. Two boxes are
// only "adjacent" (as opposed to nested or unrelated) when one starts where
// roughly the other's range on the cross-axis overlaps — e.g. two regions
// stacked vertically with overlapping x-ranges, or side by side with
// overlapping y-ranges. Nested regions (a card containing its own title)
// overlap on both axes and are correctly excluded — containment isn't gap.
export function computeSpacing(regions: Region[]): Map<Region, number> {
  const spacing = new Map<Region, number>();

  for (const region of regions) {
    let nearest = Infinity;
    for (const other of regions) {
      if (other === region) continue;
      const distance = edgeDistance(region.box, other.box);
      if (distance !== null && distance < nearest) nearest = distance;
    }
    if (nearest !== Infinity) spacing.set(region, Math.round(nearest));
  }

  return spacing;
}

function edgeDistance(a: BoundingBox, b: BoundingBox): number | null {
  const verticalOverlap = rangesOverlap(a.x, a.x + a.width, b.x, b.x + b.width);
  if (verticalOverlap) {
    if (b.y >= a.y + a.height) return b.y - (a.y + a.height);
    if (a.y >= b.y + b.height) return a.y - (b.y + b.height);
  }

  const horizontalOverlap = rangesOverlap(a.y, a.y + a.height, b.y, b.y + b.height);
  if (horizontalOverlap) {
    if (b.x >= a.x + a.width) return b.x - (a.x + a.width);
    if (a.x >= b.x + b.width) return a.x - (b.x + b.width);
  }

  return null;
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// "Shared left edges → likely column; shared top edges → likely row" —
// groups of 2+ regions whose left (or top) edges line up within a small
// tolerance are tagged as a flex column (or row). A region that matches
// both is tagged as a row — an arbitrary but reasonable tie-break for the
// rare grid-like case, not a claim that row "wins" semantically.
export type LayoutHint = { display: "flex"; flexDirection: "row" | "column" };

const EDGE_GROUP_TOLERANCE = 6;

export function detectLayoutGroups(regions: Region[]): Map<Region, LayoutHint> {
  const hints = new Map<Region, LayoutHint>();

  for (const group of groupByEdge(regions, (r) => r.box.x)) {
    if (group.length < 2) continue;
    for (const region of group) hints.set(region, { display: "flex", flexDirection: "column" });
  }

  for (const group of groupByEdge(regions, (r) => r.box.y)) {
    if (group.length < 2) continue;
    for (const region of group) hints.set(region, { display: "flex", flexDirection: "row" });
  }

  return hints;
}

function groupByEdge(regions: Region[], edge: (r: Region) => number): Region[][] {
  const buckets = new Map<number, Region[]>();
  for (const region of regions) {
    const key = Math.round(edge(region) / EDGE_GROUP_TOLERANCE);
    const bucket = buckets.get(key) ?? [];
    bucket.push(region);
    buckets.set(key, bucket);
  }
  return Array.from(buckets.values());
}
