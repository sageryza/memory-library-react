# Memory Library

A React-based personal knowledge management application for capturing, organizing, and visualizing memories (notes/thoughts) across multiple interactive views.

## What It Does

Memory Library provides four different ways to work with your notes:

- **🗂️ Conspiracy Board** - Visual canvas with drag-and-drop positioning and connection drawing between related memories
- **📚 Archive** - Pinterest-style masonry grid for browsing all memories with advanced search and filtering
- **⏳ Chronology** - Timeline interface for arranging memories in chronological order
- **📖 Libraries** - Collections for organizing memories with manual curation and/or search-based dynamic filtering (hybrid support)

## Key Features

- **Dual Mode Operation**: Works as a demo (localStorage) or with Firebase authentication for cloud sync
- **Hashtag System**: Auto-extracts hashtags from content to create "Constellations" (grouped memories)
- **Visual Connections**: Draw connections between memories with insight annotations
- **Advanced Search**: Multi-criteria search with AND/OR logic, save searches as Libraries
- **Drag-and-Drop**: Intuitive organization across all views
- **Offline Support**: Demo mode works entirely offline
- **Auto-Migration**: Seamlessly migrates demo data to cloud when you sign up

## Installation

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Firebase project (for authenticated mode)

### Setup

1. **Clone and install dependencies**
   ```bash
   git clone <repository-url>
   cd memory-library-react
   npm install
   ```

2. **Firebase Configuration**

   The app currently includes Firebase config in `src/firebase.js`. For your own deployment:

   - Create a Firebase project at https://console.firebase.google.com
   - Enable Authentication (Email/Password)
   - Enable Firestore Database
   - Copy your Firebase config and replace values in `src/firebase.js`

3. **Run the development server**
   ```bash
   npm run dev
   ```

   App will be available at `http://localhost:5173`

4. **Build for production**
   ```bash
   npm run build
   ```

## Usage

### Demo Mode (No Account)
- Start using the app immediately without signing up
- Data stored in browser localStorage (max 100 memories)
- All features available except cloud sync
- Click "Sign In / Sign Up" anytime to migrate your data to the cloud

### Authenticated Mode
- Sign up with email/password
- Unlimited memories with cloud storage
- Data syncs across devices
- View-specific state persisted (board layouts, chronology order, etc.)

## Project Structure

```
src/
├── components/          # React components
│   ├── conspiracy-board/   # Conspiracy Board view
│   ├── archive/            # Archive view
│   ├── libraries/          # Libraries view
│   ├── playgrounds/        # Playground feature
│   └── shared/             # Reusable components
├── hooks/              # Custom React hooks (state management)
├── utils/              # Utility functions
├── styles/             # Global CSS and themes
├── App.jsx             # Main app component with routing
├── firebase.js         # Firebase configuration
└── main.jsx           # React entry point
```

## Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Complete architecture overview, data flow, and component hierarchy
- **[HOOKS.md](./HOOKS.md)** - Custom hooks API reference for state management
- **[STYLING-GUIDE.md](./STYLING-GUIDE.md)** - Design system and global styling patterns
- **[CHRONOLOGY_DOCUMENTATION.md](./CHRONOLOGY_DOCUMENTATION.md)** - Detailed Chronology view documentation

## Tech Stack

- **React 19** - UI framework
- **Vite** - Build tool and dev server
- **Firebase** - Authentication + Firestore database
- **React Router** - Client-side routing
- **@dnd-kit** - Drag-and-drop functionality
- **Lucide React** - Icon library
- **React Masonry CSS** - Masonry grid layout

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint

### Key Development Principles

1. **Global Styling First** - Use centralized theme system (see STYLING-GUIDE.md)
2. **ID Consistency** - All IDs are strings (see `src/utils/generateId.js`)
3. **State Management** - Use custom hooks for all data operations
4. **Offline-First** - Consider both localStorage and Firebase paths

## Browser Support

Modern browsers with ES6+ support:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## License

[Add your license here]

## Contributing

[Add contribution guidelines if needed]
