import {FlatCompat} from '@eslint/eslintrc';
import {fileURLToPath} from 'node:url';

const compat=new FlatCompat({baseDirectory:fileURLToPath(new URL('.',import.meta.url))});
const config=[
  {ignores:['.next-auth-test/**','.next/**','out/**','dist/**','build/**','vendor/**','next-env.d.ts','vite.config.ts']},
  ...compat.extends('next/core-web-vitals','next/typescript'),
  {
    files:['components/ui/**/*.{ts,tsx}','hooks/use-mobile.ts'],
    rules:{'@typescript-eslint/no-unused-vars':'off','react-hooks/purity':'off','react-hooks/set-state-in-effect':'off'},
  },
];
export default config;
