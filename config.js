// config.js — configurações públicas do Firebase (o apiKey do Firebase não é segredo; quem protege é o login + as regras do banco).
export const VERSAO = '1.3.1';

// Projeto do painel: login do admin, lista de lojas e histórico
export const PAINEL_CONFIG = {
  apiKey: 'AIzaSyA2UcroLv68tSl3ogBl2KCHJ9E-N93Snig',
  authDomain: 'cinemateca-c5202.firebaseapp.com',
  databaseURL: 'https://cinemateca-c5202-default-rtdb.firebaseio.com',
  projectId: 'cinemateca-c5202',
  storageBucket: 'cinemateca-c5202.firebasestorage.app',
  messagingSenderId: '649258260967',
  appId: '1:649258260967:web:3077a15ec1e7854e1e0542',
};

// VortexSmart (somente leitura na fase 1: o painel entra com o login de admin e chama adminListarLojas, que já existe)
export const SMART_CONFIG = {
  apiKey: 'AIzaSyC1HuGxN7ko4MdYYJCM5QDQmkpbN5lfxA4',
  authDomain: 'vortex-b3761.firebaseapp.com',
  databaseURL: 'https://vortex-b3761-default-rtdb.firebaseio.com',
  projectId: 'vortex-b3761',
  storageBucket: 'vortex-b3761.firebasestorage.app',
  messagingSenderId: '920463151800',
  appId: '1:920463151800:web:6011489281000edab365a4d',
};

export const TIMEOUT_MS = 8000;
