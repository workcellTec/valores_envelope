# Painel Vortex

PWA de administração das lojas **VortexCell** (e consulta do **VortexSmart**): vencimento, +30 dias, bloqueio, histórico.

## Como funciona
- O painel tem o próprio projeto Firebase (`cinemateca-c5202`, só o Realtime Database + login). Lá ficam a lista de lojas (`lojas/`) e o histórico (`historico/`). Só o UID do administrador lê e escreve (`database.rules.json`).
- Cada loja VortexCell tem o próprio banco. O painel lê/grava `config/licenca = { bloqueado, vencimento }` nele, o mesmo caminho que o app da loja já usa.
- Bloqueio automático: o app da loja bloqueia no dia seguinte ao vencimento. O painel mostra o mesmo estado (fuso de Brasília).
- Renovar +30 dias roda em transação: a base é lida do banco na hora de gravar, então clique duplo ou dois aparelhos não somam 60 dias.
- VortexSmart: só leitura nesta versão (nada nas regras ou funções dele foi alterado).

## Arquivos
| Arquivo | Função |
|---|---|
| `lib.js` | regras (datas, +30 dias, estado, validações), sem Firebase. Testado em `test/lib.test.mjs` |
| `data.js` | tudo que fala com o Firebase |
| `app.js`, `index.html`, `style.css` | telas |
| `config.js` | configs do Firebase do painel e do VortexSmart, versão |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA |
| `database.rules.json` | regras do banco do painel (colar no Console) |
| `test/` | `npm test` (regras) e `python3 test/smoke.py` (navegador, banco simulado) |

## Publicar (GitHub Pages)
1. Repositório → Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`.
2. Endereço: `https://SEU-USUARIO.github.io/painel-vortex/`. Abra no celular → menu do navegador → *Adicionar à tela inicial*.

## Banco do painel (uma vez)
1. Console Firebase → Authentication → habilitar *E-mail/senha* e criar o usuário administrador.
2. Realtime Database → Regras → colar `database.rules.json` → Publicar.

## Nova versão
Mude `VERSAO` em `config.js` e `CACHE` em `sw.js` para o mesmo número, e publique.

## Depois (precisa de PC)
Vencimento automático e troca de senha no VortexSmart: novas Cloud Functions, só adicionando (sem mexer nas existentes nem nas regras).

## App Android (APK)

`android/` é uma casca mínima (WebView) que abre o painel hospedado no GitHub Pages em tela cheia, sem depender do Chrome.
O painel continua atualizando sozinho; o APK só precisa ser refeito se `android/` mudar.

- O GitHub Actions (`.github/workflows/apk.yml`) compila o APK a cada mudança em `android/`, toda segunda-feira e manualmente (Actions → Gerar APK → Run workflow).
- Download fixo: `https://github.com/workcellTec/valores_envelope/releases/download/apk-latest/PainelVortex.apk`
- A chave de assinatura é criada pelo próprio workflow e guardada no cache privado do repositório (não está no código). Enquanto ela existir, cada APK novo instala por cima do antigo.
- Para trocar o endereço do painel, edite `URL`/`HOST` em `android/app/src/main/java/com/workcelltec/vortex/MainActivity.java`.
