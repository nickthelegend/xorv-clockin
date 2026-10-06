// Polyfills first: @solana/web3.js v1 needs crypto.getRandomValues and Buffer on Hermes.
import 'react-native-get-random-values';
import { Buffer } from 'buffer';
(globalThis as any).Buffer = (globalThis as any).Buffer || Buffer;

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
