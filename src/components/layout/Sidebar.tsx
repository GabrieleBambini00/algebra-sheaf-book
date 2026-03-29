import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { Home } from 'lucide-react';

interface ChapterEntry {
  id: string;
  path: string;
  title: string;
  part?: string; // Section divider label
}

const chapters: ChapterEntry[] = [
  // Part I — Linear Algebra
  { id: '01', path: '/chapter/1',  title: 'Vectors, Covectors, and Space',          part: 'I · Linear Algebra' },
  { id: '02', path: '/chapter/2',  title: 'Matrices as Transformations' },
  { id: '03', path: '/chapter/3',  title: 'Inner Products and Orthogonality' },
  { id: '04', path: '/chapter/4',  title: 'Eigenvalues and Diagonalization' },
  { id: '05', path: '/chapter/5',  title: 'Bilinear and Quadratic Forms' },
  { id: '06', path: '/chapter/6',  title: 'Multilinearity and Tensors' },
  { id: '07', path: '/chapter/7',  title: 'Quotients and Universality' },
  // Part II — Topology & Geometry
  { id: '08', path: '/chapter/8',  title: 'Introduction to Topology',               part: 'II · Topology & Geometry' },
  { id: '09', path: '/chapter/9',  title: 'Bases, Coverings, Continuity' },
  { id: '10', path: '/chapter/10', title: 'Compactness and Connectedness' },
  { id: '11', path: '/chapter/11', title: 'Manifolds and Local Coordinates' },
  { id: '12', path: '/chapter/12', title: 'Tangent Fields and Differentiability' },
  { id: '13', path: '/chapter/13', title: 'Bundles and Data over Spaces' },
  // Part III — Algebra & Categories
  { id: '14', path: '/chapter/14', title: 'Groups, Rings, and Modules',             part: 'III · Algebra & Categories' },
  { id: '15', path: '/chapter/15', title: 'Categories, Functors, Naturality' },
  // Part IV — Sheaves
  { id: '16', path: '/chapter/16', title: 'Intuition Toward Presheaves',            part: 'IV · Sheaves' },
  { id: '17', path: '/chapter/17', title: 'Presheaves in Precise Form' },
  { id: '18', path: '/chapter/18', title: 'Local Data and Compatibility' },
  { id: '19', path: '/chapter/19', title: 'Sheaves, Locality, and Gluing' },
  { id: '20', path: '/chapter/20', title: 'Sections, Stalks, and Final Panorama' },
];

export const Sidebar: React.FC = () => {
  const { chapterProgress } = useStore();
  const location = useLocation();

  const completedCount = Object.values(chapterProgress).filter(
    (s) => s === 'completed'
  ).length;

  const isHome = location.pathname === '/';

  return (
    <aside className="w-72 h-screen border-r border-gray-200 bg-gray-50/80 flex flex-col justify-between hidden md:flex sticky top-0 font-sans">
      {/* Scrollable chapter list */}
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="p-5 pb-3 border-b border-gray-100">
          <Link
            to="/"
            className={`flex items-center gap-2.5 p-2 -m-2 rounded-lg transition-colors ${
              isHome
                ? 'text-blue-700'
                : 'text-gray-700 hover:text-blue-600 hover:bg-blue-50/50'
            }`}
          >
            <Home className="w-4 h-4 flex-shrink-0" />
            <h1 className="text-xs font-bold tracking-[0.2em] uppercase">
              Algebra to Sheaves
            </h1>
          </Link>
        </div>

        {/* Chapter nav */}
        <nav className="px-3 py-4">
          <div className="space-y-0.5 relative">
            {chapters.map((chapter, idx) => {
              const isActive = location.pathname === chapter.path;
              const status = chapterProgress[chapter.id] || 'unread';

              return (
                <React.Fragment key={chapter.id}>
                  {/* Part divider */}
                  {chapter.part && (
                    <div className={`${idx > 0 ? 'pt-5' : ''} pb-2 px-3`}>
                      <span className="text-[0.6rem] font-bold tracking-[0.2em] uppercase text-gray-400">
                        {chapter.part}
                      </span>
                    </div>
                  )}

                  <Link
                    to={chapter.path}
                    className={`group flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ${
                      isActive
                        ? 'bg-blue-50 text-blue-900 shadow-sm'
                        : 'text-gray-500 hover:bg-gray-100/80 hover:text-gray-800'
                    }`}
                  >
                    {/* Status dot */}
                    <div
                      className={`w-2 h-2 rounded-full flex-shrink-0 transition-all ${
                        status === 'completed'
                          ? 'bg-blue-500'
                          : status === 'in-progress'
                          ? 'bg-blue-300 ring-2 ring-blue-200'
                          : isActive
                          ? 'bg-blue-400'
                          : 'bg-gray-200 group-hover:bg-gray-300'
                      }`}
                    />

                    {/* Chapter number + title */}
                    <div className="min-w-0 flex-1">
                      <span
                        className={`text-[0.78rem] leading-snug block truncate ${
                          isActive ? 'font-semibold' : 'font-medium'
                        }`}
                      >
                        <span className="text-[0.65rem] font-bold opacity-50 mr-1">
                          {chapter.id}.
                        </span>
                        {chapter.title}
                      </span>
                    </div>
                  </Link>
                </React.Fragment>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Progress footer */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[0.6rem] font-bold tracking-[0.15em] uppercase text-gray-400">
            Progress
          </span>
          <span className="text-[0.6rem] font-mono text-gray-400">
            {completedCount}/{chapters.length}
          </span>
        </div>
        <div className="w-full bg-gray-200 h-1 rounded-full overflow-hidden">
          <div
            className="bg-blue-500 h-full rounded-full transition-all duration-700"
            style={{
              width: `${(completedCount / chapters.length) * 100}%`,
            }}
          />
        </div>
      </div>
    </aside>
  );
};
