import React from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { BookOpen, ChevronRight, Sparkles } from 'lucide-react';

const parts = [
  {
    title: 'Part I — Linear Algebra',
    description: 'The language of transformations, measurement, and structure',
    chapters: [
      { num: 1, title: 'Vectors, Covectors, and the Philosophy of Space' },
      { num: 2, title: 'Matrices as Active Transformations' },
      { num: 3, title: 'Inner Products, Orthogonality, and Measurement' },
      { num: 4, title: 'Eigenvalues, Diagonalization, and Geometric Dynamics' },
      { num: 5, title: 'Bilinear and Quadratic Forms' },
      { num: 6, title: 'Multilinearity and Tensors' },
      { num: 7, title: 'Quotients, Universality, and Natural Constructions' },
    ],
  },
  {
    title: 'Part II — Topology and Geometry',
    description: 'From local neighborhoods to the global shape of spaces',
    chapters: [
      { num: 8, title: 'Introduction to Topology and the Idea of Locality' },
      { num: 9, title: 'Bases for Topologies, Coverings, and Continuity' },
      { num: 10, title: 'Compactness, Connectedness, and Global Behavior' },
      { num: 11, title: 'Manifolds, Charts, Atlases, and Local Coordinates' },
      { num: 12, title: 'Tangent Fields, Differentiability, and Local Structures' },
      { num: 13, title: 'Bundles and the Intuition of Data over Spaces' },
    ],
  },
  {
    title: 'Part III — Algebra and Categories',
    description: 'The structural language that makes sheaves possible',
    chapters: [
      { num: 14, title: 'Groups, Rings, Modules, and Algebraic Structures' },
      { num: 15, title: 'Categories, Functors, Naturality, and Structural Language' },
    ],
  },
  {
    title: 'Part IV — Sheaves',
    description: 'The culmination: from local data to global truth',
    chapters: [
      { num: 16, title: 'Assigning Data to Open Sets — Intuition Toward Presheaves' },
      { num: 17, title: 'Presheaves in Precise Form' },
      { num: 18, title: 'Local Data, Restrictions, and Compatibility' },
      { num: 19, title: 'Sheaves, Locality Axioms, and Gluing' },
      { num: 20, title: 'Sections, Stalks, Morphisms, and Final Panorama' },
    ],
  },
];

export const HomePage: React.FC = () => {
  const { chapterProgress } = useStore();

  const completedCount = Object.values(chapterProgress).filter(
    (s) => s === 'completed'
  ).length;

  // Find first unread or in-progress chapter
  let resumeChapter = 1;
  for (let i = 1; i <= 20; i++) {
    const id = String(i).padStart(2, '0');
    const status = chapterProgress[id];
    if (!status || status === 'unread' || status === 'in-progress') {
      resumeChapter = i;
      break;
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <header className="max-w-4xl mx-auto px-8 pt-24 pb-16">
        <p className="text-sm font-sans font-semibold tracking-[0.25em] uppercase text-blue-600 mb-6">
          An Interactive Mathematical Journey
        </p>
        <h1 className="text-5xl md:text-6xl font-serif font-bold text-gray-900 leading-[1.1] mb-8 tracking-tight">
          From Linear Algebra
          <br />
          <span className="text-blue-600">to Sheaf Theory</span>
        </h1>
        <p className="text-xl font-serif text-gray-600 leading-relaxed max-w-2xl mb-12">
          A rigorous, self-contained journey through the mathematics that connects the geometry of
          vector spaces to the profound local-to-global principles of modern sheaf theory.
          Twenty chapters. Hundreds of interactive visualizations. One coherent arc.
        </p>

        <div className="flex items-center gap-4">
          <Link
            to={`/chapter/${resumeChapter}`}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-8 py-3.5 rounded-full font-sans font-semibold text-sm tracking-wide hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20"
          >
            <BookOpen className="w-4 h-4" />
            {completedCount > 0 ? 'Continue Reading' : 'Begin Reading'}
            <ChevronRight className="w-4 h-4" />
          </Link>
          {completedCount > 0 && (
            <span className="text-sm font-sans text-gray-400">
              {completedCount} of 20 chapters completed
            </span>
          )}
        </div>
      </header>

      {/* Philosophical epigraph */}
      <div className="max-w-3xl mx-auto px-8 py-12 border-t border-gray-100">
        <blockquote className="text-lg font-serif italic text-gray-500 leading-relaxed text-center">
          "The passage from linear algebra to sheaf theory is not merely a technical escalation.
          It is a philosophical revolution. Linear algebra asks: what are the symmetries of a single
          flat space? Sheaf theory asks: given that the world is assembled from many overlapping
          flat pieces, under what conditions does locally consistent information determine a globally
          consistent truth?"
        </blockquote>
      </div>

      {/* The Arc */}
      <section className="max-w-4xl mx-auto px-8 py-16">
        <div className="flex items-center gap-3 mb-3">
          <Sparkles className="w-5 h-5 text-blue-500" />
          <h2 className="text-sm font-sans font-bold tracking-[0.2em] uppercase text-gray-400">
            The Trajectory
          </h2>
        </div>
        <p className="text-lg font-serif text-gray-600 leading-relaxed mb-16 max-w-2xl">
          Each chapter is a self-contained study, but the twenty together form one
          intellectual arc — from the axioms of a vector space to the local-to-global
          principles that govern modern geometry, topology, and data science.
        </p>

        <div className="space-y-16">
          {parts.map((part, partIdx) => (
            <div key={partIdx}>
              <div className="mb-6">
                <h3 className="text-lg font-sans font-bold text-gray-900 mb-1">
                  {part.title}
                </h3>
                <p className="text-sm font-serif text-gray-500">{part.description}</p>
              </div>
              <div className="grid gap-2">
                {part.chapters.map((ch) => {
                  const id = String(ch.num).padStart(2, '0');
                  const status = chapterProgress[id] || 'unread';
                  return (
                    <Link
                      key={ch.num}
                      to={`/chapter/${ch.num}`}
                      className="group flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all"
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-sans font-bold flex-shrink-0 transition-colors ${
                          status === 'completed'
                            ? 'bg-blue-600 text-white'
                            : status === 'in-progress'
                            ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-300'
                            : 'bg-gray-100 text-gray-400 group-hover:bg-blue-100 group-hover:text-blue-600'
                        }`}
                      >
                        {ch.num}
                      </div>
                      <span
                        className={`text-sm font-serif leading-snug transition-colors ${
                          status === 'completed'
                            ? 'text-gray-500'
                            : 'text-gray-800 group-hover:text-blue-900'
                        }`}
                      >
                        {ch.title}
                      </span>
                      <ChevronRight className="w-4 h-4 ml-auto text-gray-300 group-hover:text-blue-400 transition-colors" />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Progress bar at bottom */}
      {completedCount > 0 && (
        <section className="max-w-4xl mx-auto px-8 py-12 border-t border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-sans font-bold tracking-widest uppercase text-gray-400">
              Your Progress
            </span>
            <span className="text-xs font-sans text-gray-400">
              {completedCount}/20
            </span>
          </div>
          <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
            <div
              className="bg-blue-600 h-full rounded-full transition-all duration-700"
              style={{ width: `${(completedCount / 20) * 100}%` }}
            />
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-8 py-12 border-t border-gray-100 text-center">
        <p className="text-xs font-sans text-gray-400">
          An interactive textbook crafted with mathematical rigor and editorial care.
        </p>
      </footer>
    </div>
  );
};
