#!/usr/bin/env bash
# Reports build progress by parsing checkboxes in docs/roadmap/PLAN.md.
# Legend: [ ] pending, [/] in progress, [x] done. No manual percentages.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLAN="${1:-$ROOT/docs/roadmap/PLAN.md}"

awk '
/^## / {
  phase = substr($0, 4)
  phases[++np] = phase
  pt[np] = 0; pd[np] = 0; pi[np] = 0
  cur = 0
  next
}
/^### / {
  group = substr($0, 5)
  groups[++ng] = group
  gphase[ng] = np
  gt[ng] = 0; gd[ng] = 0; gi[ng] = 0
  cur = ng
  next
}
/^- \[[ xX\/]\]/ {
  if (cur == 0 || gphase[cur] != np) {
    groups[++ng] = "Scope"
    gphase[ng] = np
    gt[ng] = 0; gd[ng] = 0; gi[ng] = 0
    cur = ng
  }
  line = $0
  t++; pt[np]++; gt[cur]++
  if (line ~ /^- \[[xX]\]/) { d++; pd[np]++; gd[cur]++ }
  else if (line ~ /^- \[\/\]/) { p++; pi[np]++; gi[cur]++ }
  next
}
END {
  for (i = 1; i <= np; i++) {
    if (pt[i] == 0) continue
    pct = (pt[i] > 0) ? int(100 * pd[i] / pt[i]) : 100
    printf "%s — %d/%d (%d%%)", phases[i], pd[i], pt[i], pct
    if (pi[i] > 0) printf ", %d in progress", pi[i]
    printf "\n"
    for (j = 1; j <= ng; j++) {
      if (gphase[j] == i) {
        gpct = (gt[j] > 0) ? int(100 * gd[j] / gt[j]) : 100
        printf "  [%d/%d %d%%", gd[j], gt[j], gpct
        if (gi[j] > 0) printf " +%d active", gi[j]
        printf "] %s\n", groups[j]
      }
    }
  }
  totalpct = (t > 0) ? int(100 * d / t) : 100
  printf "TOTAL — %d/%d (%d%%)", d, t, totalpct
  if (p > 0) printf ", %d in progress", p
  printf "\n"
}
' "$PLAN"
