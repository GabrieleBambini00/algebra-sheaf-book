import React from 'react';
import { MDXProvider } from '@mdx-js/react';
import { VectorTransformSim } from './VectorTransformSim';
import { DeterminantAreaSim } from './DeterminantAreaSim';
import { InnerProductSim } from './InnerProductSim';
import { SVDSim } from './SVDSim';
import { GraphSim } from './GraphSim';
import { FunctionPlotSim } from './FunctionPlotSim';
import { ChainComplexSim } from './ChainComplexSim';
import { PersistenceSim } from './PersistenceSim';
import { NeuralNetSim } from './NeuralNetSim';
import { EigenSim } from './EigenSim';
import { TopologySim } from './TopologySim';
import { ManifoldSim } from './ManifoldSim';
import { CategorySim } from './CategorySim';
import { BundleSim } from './BundleSim';
import { BilinearFormSim } from './BilinearFormSim';
import { PresheafSim } from './PresheafSim';
import { TensorSim } from './TensorSim';

const components = {
  h1: (props: any) => <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 mb-8 font-sans" {...props} />,
  h2: (props: any) => <h2 className="text-2xl font-bold tracking-tight text-gray-900 mt-12 mb-6 font-sans border-b border-gray-100 pb-2" {...props} />,
  h3: (props: any) => <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4 font-sans" {...props} />,
  p: (props: any) => <p className="leading-[1.65] mb-5 font-serif text-[1.15rem] tracking-tight text-gray-800" {...props} />,
  a: (props: any) => <a className="text-blue-600 hover:text-blue-800 underline decoration-blue-200 underline-offset-4" {...props} />,
  blockquote: (props: any) => (
    <blockquote className="border-l-4 border-blue-500 pl-6 my-8 italic text-gray-700 bg-blue-50/30 py-3 pr-4 rounded-r-lg" {...props} />
  ),
  ul: (props: any) => <ul className="list-disc list-outside ml-6 mb-5 space-y-1.5 text-[1.15rem] text-gray-800 leading-[1.65]" {...props} />,
  ol: (props: any) => <ol className="list-decimal list-outside ml-6 mb-5 space-y-1.5 text-[1.15rem] text-gray-800 leading-[1.65]" {...props} />,
  li: (props: any) => <li className="pl-2" {...props} />,
  code: (props: any) => <code className="bg-gray-50 text-gray-800 px-1.5 py-0.5 rounded text-[0.9em] font-mono border border-gray-200" {...props} />,
  VectorTransformSim: (props: any) => <VectorTransformSim {...props} />,
  DeterminantAreaSim: (props: any) => <DeterminantAreaSim {...props} />,
  InnerProductSim: (props: any) => <InnerProductSim {...props} />,
  SVDSim: (props: any) => <SVDSim {...props} />,
  GraphSim: (props: any) => <GraphSim {...props} />,
  FunctionPlotSim: (props: any) => <FunctionPlotSim {...props} />,
  ChainComplexSim: (props: any) => <ChainComplexSim {...props} />,
  PersistenceSim: (props: any) => <PersistenceSim {...props} />,
  NeuralNetSim: (props: any) => <NeuralNetSim {...props} />,
  EigenSim: (props: any) => <EigenSim {...props} />,
  TopologySim: (props: any) => <TopologySim {...props} />,
  ManifoldSim: (props: any) => <ManifoldSim {...props} />,
  CategorySim: (props: any) => <CategorySim {...props} />,
  BundleSim: (props: any) => <BundleSim {...props} />,
  BilinearFormSim: (props: any) => <BilinearFormSim {...props} />,
  PresheafSim: (props: any) => <PresheafSim {...props} />,
  TensorSim: (props: any) => <TensorSim {...props} />,
};

export const MathMDXProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <MDXProvider components={components}>{children}</MDXProvider>;
};
