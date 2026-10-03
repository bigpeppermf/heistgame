# HEISTCODE Art Assets

This folder contains all the pure presentational SVG components for HEISTCODE.
These components have no state, no hooks, and no dependencies outside of this folder.

## Icons (Power-ups)
All icons scale with the `size` prop and inherit text color (`currentColor`).

```tsx
import { IconEMP } from '@/components/art/icons/IconEMP';
import { IconBlackout } from '@/components/art/icons/IconBlackout';
import { IconJammedComms } from '@/components/art/icons/IconJammedComms';
import { IconSmokeBomb } from '@/components/art/icons/IconSmokeBomb';
import { IconRoadblock } from '@/components/art/icons/IconRoadblock';
import { IconGetawayCar } from '@/components/art/icons/IconGetawayCar';
import { IconShield } from '@/components/art/icons/IconShield';
```

## Board Pieces
These represent the markers and tiles on the game board. 

```tsx
import { CopMarker } from '@/components/art/board/CopMarker';
import { RobberMarker } from '@/components/art/board/RobberMarker';
import { TilePlain } from '@/components/art/board/TilePlain';
import { TileStash } from '@/components/art/board/TileStash';
import { TileEscape } from '@/components/art/board/TileEscape';
```

## Usage
Simply drop them into your JSX:
```tsx
<IconEMP size={24} className="text-var(--hc-robber)" />
<CopMarker size={48} />
```
