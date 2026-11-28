# DnD Character Sheet System

A single-page, fully responsive React/TypeScript application for creating, managing, and viewing D&D 5e character sheets with **100% client-side storage** using IndexedDB. No backend, no servers, no accounts needed - your data stays on your device!

## Quality Gates

| Gate | Status |
|------|--------|
| Quality Gate | ![Quality Gate](https://github.com/joelmale/NexusForge/actions/workflows/quality-gate.yml/badge.svg?branch=master) |
| Test Coverage | ![Test Coverage](https://codecov.io/gh/joelmale/NexusForge/branch/master/graph/badge.svg) |
| Bundle Size (CI) | ![Bundle Size](https://img.shields.io/badge/bundle%20size-checked%20in%20CI-2ea44f) |
| Security | ![Security](https://github.com/joelmale/NexusForge/actions/workflows/codeql.yml/badge.svg?branch=master) |
| Build & Deploy | ![Build & Deploy](https://github.com/joelmale/NexusForge/actions/workflows/deploy.yml/badge.svg?branch=master) |
| Multi-Platform | ![Multi-Platform](https://img.shields.io/badge/platforms-amd64%20arm64-blue) |
| BuildKit | ![BuildKit](https://img.shields.io/badge/buildkit-enabled-green) |

## Overview

The DnD Character Sheet System allows users to:
- Create D&D 5e characters using a step-by-step wizard
- Store unlimited characters locally in your browser
- View interactive character sheets with dice rolling
- Export/import characters as JSON for backup and sharing
- Works completely offline after initial load

## Key Features

### Client-Side First
- **100% Local Storage**: All data stored in IndexedDB - nothing leaves your device
- **Cross-Platform**: Works on desktop browsers, iPhones, iPads, and Android devices
- **Offline Capable**: Once loaded, works without internet connection
- **Export/Import**: Full control over your data with JSON backup files
- **No Authentication**: No accounts, no sign-ups, no tracking

### D&D 5e Features

- **Dual Edition Support**: Full support for both D&D 5e 2014 (original) and 2024 (revised) rules
- **2024 PHB Complete**: All 12 Origin backgrounds, 10 core species with lineages, and comprehensive Origin Feat system
- **Persistent Storage (F1)**: Save, load, and delete multiple characters locally
- **Character Dashboard (F2)**: View all saved characters with key details
- **Creation Wizard (F3)**: Level and edition, background, species, class, abilities, spells, feats, languages, and equipment. See [docs/character-creation.md](docs/character-creation.md)
- **Rule-Based Calculations (F4)**: Automatic derivation of:
  - Ability modifiers
  - Skill bonuses with proficiency
  - Hit points (class + CON modifier + species bonuses)
  - Armor Class (10 + DEX modifier)
  - Initiative and proficiency bonus
- **Interactive Sheet (F5)**: Click any ability or skill to roll d20 + modifiers
- **Drag-and-Drop Spellbook Manager (F10)**: Unified drag-and-drop spellbook creation and management
  - Drag spells directly from the library into custom spellbooks using `@dnd-kit/core`
  - Daily spell preparation toggling with prepared count trackers
  - Session Mode view for fast prepared-only spell tracking during live sessions
  - Multi-faceted filter bar (Edition 2014/2024, Cantrip & Levels 1-9, School chips, Ritual, Concentration, ⭐ Favorites)
  - Standalone & per-character spellbook organization with JSON export/import
  - Automatic migration from legacy standalone `spellbook-forge` IndexedDB storage
- **Responsive Design (F8)**: Mobile-first design with Tailwind CSS

## Technical Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Frontend** | React 18 + TypeScript | UI components and state management |
| **Styling** | Tailwind CSS | Responsive, mobile-first design |
| **Storage** | IndexedDB | Client-side persistent storage |
| **Icons** | Lucide React | Beautiful, consistent iconography |
| **Backup** | JSON Export/Import | User-controlled data portability |

## Browser Compatibility

Works on all modern browsers with IndexedDB support:
- ✅ Chrome/Edge (Desktop & Mobile)
- ✅ Firefox (Desktop & Mobile)
- ✅ Safari (Desktop, iPhone, iPad)
- ✅ Samsung Internet
- ✅ Opera

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn
- Modern web browser

### Local Development

1. Clone the repository:
```bash
git clone https://github.com/joelmale/NexusForge.git dnd-character-sheet-system
cd dnd-character-sheet-system
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open your browser to `http://localhost:3000`

5. Build for production:
```bash
npm run build
```

### Docker Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete Docker Swarm deployment instructions.

**Quick Start with Docker:**
```bash
# Build the image
docker build -t dnd-character-sheet-system .

# Run locally
docker run -p 8080:80 dnd-character-sheet-system

# Deploy to Swarm
docker stack deploy -c docker-compose.yml character-forge
```

**🚀 Build Optimizations:**
- **90% smaller build context** (~30MB vs 352MB)
- **Multi-platform support** (AMD64 + ARM64)
- **BuildKit optimizations** with cache mounts
- **GitHub Actions CI/CD** with automated builds
- **Development mode** with `docker-compose.dev.yml`

**🏗️ CI/CD Pipeline:**
- **Automated builds** on push to master/main
- **Multi-platform images** for all architectures
- **Quality gates** with linting, testing, and security scans
- **PR validation** with build checks
- **Release automation** with GitHub releases

See [DOCKER_OPTIMIZATIONS.md](./DOCKER_OPTIMIZATIONS.md) for technical details.

**Live Demo:** https://character.nexusvtt.com

## Documentation

- [Character Sheet Guide](./docs/character-sheet.md)
- [Character Creation Wizard Guide](./docs/character-creation.md)

## Usage

### Creating a Character

1. Click **"New Character Wizard"** button
2. Follow the 5-step wizard:
   - Enter name, background, and alignment
   - Choose your race (Human, Dwarf, or Elf)
   - Choose your class (Fighter, Wizard, or Rogue)
   - Assign ability scores using Standard Array
   - Add personality traits, ideals, bonds, and flaws
3. Click **"Create Character"** to save

### Managing Characters

- **View Character Sheet**: Click "View Sheet" on any character card
- **Roll Dice**: Click any ability score or skill to roll d20 + modifier
- **Delete Character**: Click the trash icon on a character card
- **Export Data**: Click "Export Data" to download all characters as JSON
- **Import Data**: Click "Import Data" to restore from a JSON backup file

### Data Backup

**Important**: IndexedDB data is tied to your browser. To prevent data loss:

1. **Regular Backups**: Use "Export Data" to create JSON backups
2. **Before Clearing Browser Data**: Export your characters first
3. **Switching Browsers**: Export from old browser, import to new browser
4. **Sharing Characters**: Export and share JSON files with friends

## Project Structure

```
dnd-character-sheet-system/
├── src/
│   ├── App.tsx                         # Main React application
│   ├── main.tsx                        # Application entry point
│   └── index.css                       # Tailwind CSS styles
├── .github/workflows/
│   └── deploy.yml                      # CI/CD pipeline
├── Dockerfile                          # Multi-stage Docker build
├── nginx.conf                          # Nginx configuration for SPA
├── docker-compose.yml                  # Docker Swarm stack definition
├── vite.config.ts                      # Vite build configuration
├── tailwind.config.js                  # Tailwind CSS configuration
├── package.json                        # Dependencies and scripts
├── DEPLOYMENT.md                       # Deployment guide
├── D&D_5e_Character_App_Design.md      # Design documentation
└── README.md                            # This file
```

## Data Model

Characters are stored with the following structure:

```typescript
interface Character {
  id: string;                    // UUID
  name: string;
  race: string;
  class: string;
  level: number;
  alignment: string;
  background: string;
  inspiration: boolean;
  proficiencyBonus: number;
  armorClass: number;
  hitPoints: number;
  maxHitPoints: number;
  speed: number;
  initiative: number;
  abilities: {
    STR, DEX, CON, INT, WIS, CHA: {
      score: number;
      modifier: number;
    };
  };
  skills: {
    // 18 D&D 5e skills with value and proficiency
  };
  featuresAndTraits: {
    personality: string;
    ideals: string;
    bonds: string;
    flaws: string;
    classFeatures: string[];
    racialTraits: string[];
  };
}
```

## Rules content

Characters, spells, feats, backgrounds, subclasses, optional class features, gear, magic items, and monsters for the 2014 and 2024 books in the content inventory are stored in the app. Nothing is loaded from an external rules API. Spell text, magic items, and monster stat blocks are separate files and load the first time you open that book.

Still left out: 12 older species names that are already playable under another record, the 2024 Ability Score Improvement feat (the wizard treats that as an ability-score step), and the three sidekick classes from Tasha's Cauldron of Everything. The eight DMG monstrous species are included and can be hidden with `SHOW_MONSTROUS_PLAYER_SPECIES` in `src/data/contentFlags.ts` (on by default). The full table is `sourcebooks/gap_report.md`.

## Future Enhancements

- [ ] PDF export
- [ ] Character portraits
- [ ] Campaign/party management

## Privacy & Data

**Your data never leaves your device.** The DnD Character Sheet System:
- ❌ Does NOT send data to any server
- ❌ Does NOT require internet after loading
- ❌ Does NOT track users
- ❌ Does NOT collect analytics
- ✅ Stores everything in your browser's IndexedDB
- ✅ Gives you full control via export/import

## License

MIT License - Use this project for your D&D adventures!

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgments

- D&D 5e rules by Wizards of the Coast
- [Lucide](https://lucide.dev/) for beautiful icons
- [Tailwind CSS](https://tailwindcss.com/) for utility-first CSS
- The open-source D&D community

## Support

For issues, feature requests, or questions, please open an issue on GitHub.

---

**Happy Adventuring!** May your rolls be high and your characters legendary! 🎲⚔️🛡️
