import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Shell } from './components/layout/Shell';
import { HomePage } from './components/layout/HomePage';
import { Marginalia } from './components/layout/Marginalia';
import { MathMDXProvider } from './components/interactive/MDXProvider';

import Chapter1 from './content/chapters/01-linear-algebra.mdx';
import Chapter2 from './content/chapters/02-matrices-transformations.mdx';
import Chapter3 from './content/chapters/03-inner-products.mdx';
import Chapter4 from './content/chapters/04-eigenvalues-diagonalization.mdx';
import Chapter5 from './content/chapters/05-bilinear-quadratic-forms.mdx';
import Chapter6 from './content/chapters/06-multilinearity-tensors.mdx';
import Chapter7 from './content/chapters/07-quotients-universality.mdx';
import Chapter8 from './content/chapters/08-intro-topology.mdx';
import Chapter9 from './content/chapters/09-topological-bases-coverings.mdx';
import Chapter10 from './content/chapters/10-compactness-connectedness.mdx';
import Chapter11 from './content/chapters/11-manifolds-charts-atlases.mdx';
import Chapter12 from './content/chapters/12-tangent-differentiability.mdx';
import Chapter13 from './content/chapters/13-bundles.mdx';
import Chapter14 from './content/chapters/14-groups-rings-modules.mdx';
import Chapter15 from './content/chapters/15-categories-functors.mdx';
import Chapter16 from './content/chapters/16-presheaves-intuition.mdx';
import Chapter17 from './content/chapters/17-presheaves-formal.mdx';
import Chapter18 from './content/chapters/18-local-data-restrictions.mdx';
import Chapter19 from './content/chapters/19-sheaves-locality-gluing.mdx';
import Chapter20 from './content/chapters/20-sections-stalks-panorama.mdx';

import { PenSquare } from 'lucide-react';

const ChapterLayout: React.FC<{ chapterId: string, Content: React.ComponentType }> = ({ chapterId, Content }) => {
  const [isNotesOpen, setIsNotesOpen] = React.useState(false);

  return (
    <div className="flex w-full relative overflow-hidden h-screen bg-white">
      {/* Main Content Area */}
      <div className={`flex-1 h-full overflow-y-auto transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] ${isNotesOpen ? 'pr-96' : 'pr-0'}`}>
        <div className={`mx-auto px-8 md:px-16 lg:px-24 py-16 transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] ${isNotesOpen ? 'max-w-5xl' : 'max-w-none w-full'}`}>
          <div className="flex justify-end mb-8 sticky top-4 z-10 w-full pointer-events-none">
            <div className="pointer-events-auto">
              <button
                onClick={() => setIsNotesOpen(!isNotesOpen)}
                className={`flex items-center gap-2 bg-white/90 backdrop-blur border shadow-sm px-4 py-2 text-sm font-semibold transition-all ${isNotesOpen ? 'opacity-0 scale-95 border-transparent text-transparent' : 'opacity-100 scale-100 rounded-full border-gray-200 text-gray-600 hover:text-blue-600 hover:border-blue-200 shadow-lg'}`}
              >
                 <PenSquare className="w-4 h-4" />
                 Open Marginalia
              </button>
            </div>
          </div>
          <MathMDXProvider>
            <Content />
          </MathMDXProvider>
        </div>
      </div>

      {/* Sliding Drawer */}
      <div className={`fixed right-0 top-0 h-screen transition-transform duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] shadow-2xl z-20 ${isNotesOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <Marginalia chapterId={chapterId} onClose={() => setIsNotesOpen(false)} />
      </div>
    </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/chapter/1" element={<ChapterLayout chapterId="01" Content={Chapter1} />} />
          <Route path="/chapter/2" element={<ChapterLayout chapterId="02" Content={Chapter2} />} />
          <Route path="/chapter/3" element={<ChapterLayout chapterId="03" Content={Chapter3} />} />
          <Route path="/chapter/4" element={<ChapterLayout chapterId="04" Content={Chapter4} />} />
          <Route path="/chapter/5" element={<ChapterLayout chapterId="05" Content={Chapter5} />} />
          <Route path="/chapter/6" element={<ChapterLayout chapterId="06" Content={Chapter6} />} />
          <Route path="/chapter/7" element={<ChapterLayout chapterId="07" Content={Chapter7} />} />
          <Route path="/chapter/8" element={<ChapterLayout chapterId="08" Content={Chapter8} />} />
          <Route path="/chapter/9" element={<ChapterLayout chapterId="09" Content={Chapter9} />} />
          <Route path="/chapter/10" element={<ChapterLayout chapterId="10" Content={Chapter10} />} />
          <Route path="/chapter/11" element={<ChapterLayout chapterId="11" Content={Chapter11} />} />
          <Route path="/chapter/12" element={<ChapterLayout chapterId="12" Content={Chapter12} />} />
          <Route path="/chapter/13" element={<ChapterLayout chapterId="13" Content={Chapter13} />} />
          <Route path="/chapter/14" element={<ChapterLayout chapterId="14" Content={Chapter14} />} />
          <Route path="/chapter/15" element={<ChapterLayout chapterId="15" Content={Chapter15} />} />
          <Route path="/chapter/16" element={<ChapterLayout chapterId="16" Content={Chapter16} />} />
          <Route path="/chapter/17" element={<ChapterLayout chapterId="17" Content={Chapter17} />} />
          <Route path="/chapter/18" element={<ChapterLayout chapterId="18" Content={Chapter18} />} />
          <Route path="/chapter/19" element={<ChapterLayout chapterId="19" Content={Chapter19} />} />
          <Route path="/chapter/20" element={<ChapterLayout chapterId="20" Content={Chapter20} />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}

export default App;
