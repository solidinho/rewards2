/* Aurora — JavaScript puro. Sem React, npm, login ou servidor próprio.
 * Textos e estrutura: index.html | Cores e medidas: estilo.css
 * Links e feedbacks: conteudo.js
 */
const config = window.AURORA;
const icones = window.AURORA_ICONES;
const painel = document.querySelector("#painel");
const suporte = document.querySelector(".support-dialog");
const navegacao = [...document.querySelectorAll(".steps > button")];

// Estado da interface. Nenhum pedido é enviado ou registrado nesta versão.
let etapa = 1;
let nick = "";
let perfil = null;
let buscando = false;
let imagem = null;
let nomeImagem = "";
let conviteCopiado = false;
let conviteCompartilhado = false;
let segundos = 0;
let rotacao = 0;
let pausado = false;
const cachePerfis = new Map();
const cacheAvataresCards = new Map();
const movimentoReduzido = window.matchMedia("(prefers-reduced-motion: reduce)");

function copiarTemplate(id) {
  return document.querySelector(`#${id}`).content.cloneNode(true);
}

function erro(mensagem) {
  painel.querySelector(".error")?.remove();
  if (!mensagem) return;
  const aviso = document.createElement("p");
  aviso.className = "error";
  aviso.setAttribute("role", "alert");
  aviso.textContent = mensagem;
  painel.append(aviso);
}

// document.baseURI respeita o <base>: "midia/..." também funciona em /nick/.
function enderecoSeguro(valor) {
  try {
    const url = new URL(valor, document.baseURI);
    return ["https:", "http:", "file:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

// API pública: GET funciona pelo navegador sem preflight ou chaves secretas.
async function consultarJSON(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const resposta = await fetch(url, {
      signal: controller.signal,
      credentials: "omit"
    });
    if (resposta.status === 404) throw new Error("Usuário não encontrado. Confira seu nick do Roblox.");
    if (!resposta.ok) throw new Error("Não foi possível carregar o perfil. Tente novamente.");
    const dados = await resposta.json();
    if (dados.error) throw new Error("Não foi possível carregar o perfil. Confira o nick e tente novamente.");
    return dados;
  } finally { clearTimeout(timeout); }
}

async function buscarPerfil(evento) {
  evento.preventDefault();
  if (buscando) return;
  nick = painel.querySelector("#nickname").value.trim().replace(/^@/, "");
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(nick)) {
    erro("Digite seu nome de usuário Roblox, com 3 a 20 caracteres.");
    return;
  }
  buscando = true;
  erro("");
  atualizarNavegacao();
  const botao = painel.querySelector("form > .primary");
  const campo = painel.querySelector("#nickname");
  campo.disabled = true;
  if (botao) {
    botao.disabled = true;
    botao.innerHTML = icones.spinner + " BUSCANDO PERFIL";
    botao.querySelector("svg").classList.add("spin");
  }
  painel.setAttribute("aria-busy", "true");
  try {
    const chave = nick.toLowerCase();
    const salvo = cachePerfis.get(chave);
    if (salvo && Date.now() - salvo.hora < 600000) {
      perfil = salvo.perfil;
    } else {
      const url = new URL(config.apiPerfil, location.href);
      url.searchParams.set("username", nick);
      const usuario = await consultarJSON(url.href);
      if (!Number.isSafeInteger(usuario.userId) || usuario.userId <= 0) {
        throw new Error("A API não retornou um perfil válido. Confira o nick e tente novamente.");
      }
      if (usuario.username && usuario.username.toLowerCase() !== chave) {
        throw new Error("O perfil retornado não corresponde ao nick informado. Tente novamente.");
      }
      // Compatível tanto com api.js local (userId/imageUrl) quanto com a
      // versão publicada, que também retorna username/displayName.
      perfil = {
        id: usuario.userId,
        name: usuario.username || nick,
        displayName: usuario.displayName || usuario.username || nick,
        avatar: usuario.imageUrl ? enderecoSeguro(usuario.imageUrl) || null : null
      };
      if (perfil.avatar) cachePerfis.set(chave, {perfil, hora: Date.now()});
    }
    mostrarEtapa(1, false);
  } catch (falha) {
    erro(falha instanceof TypeError || falha.name === "AbortError"
      ? "Não foi possível conectar à consulta de perfis. Confira a conexão e tente novamente."
      : falha.message);
  } finally {
    buscando = false;
    painel.setAttribute("aria-busy", "false");
    atualizarNavegacao();
    const input = painel.querySelector("#nickname");
    if (input) input.disabled = false;
    const continuar = painel.querySelector("form > .primary");
    if (continuar) {
      continuar.textContent = "CONTINUAR";
      continuar.disabled = !nick.trim();
    }
  }
}

function preencherPerfil() {
  const cartao = painel.querySelector(".profile-result");
  if (!cartao || !perfil) return;
  cartao.querySelector("strong").textContent = perfil.displayName;
  cartao.querySelector(":scope > div > span").textContent = `@${perfil.name}`;
  cartao.querySelector("small").textContent = `ID ${perfil.id}`;
  cartao.querySelector("a").href = `https://www.roblox.com/users/${perfil.id}/profile`;
  const avatar = cartao.querySelector(".avatar-real");
  avatar.innerHTML = icones.user;
  if (perfil.avatar) {
    const foto = document.createElement("img");
    foto.src = perfil.avatar;
    foto.alt = `Avatar de ${perfil.name}`;
    foto.onerror = () => { avatar.innerHTML = icones.user; };
    avatar.replaceChildren(foto);
  }
}

// Passo 4 exige a captura do passo 3; passo 5 exige o link copiado no passo 4.
function etapaLiberada(numero) {
  if (numero === 1) return true;
  if (!perfil) return false;
  if (numero >= 4 && !imagem) return false;
  if (numero === 5 && !conviteCopiado && !conviteCompartilhado) return false;
  return true;
}

// Desativa o CONTINUAR da etapa atual até a condição ser cumprida.
function atualizarContinuar() {
  const botao = painel.querySelector(".next-step");
  if (!botao) return;
  const liberado = etapaLiberada(etapa + 1);
  botao.disabled = !liberado;
  botao.textContent = liberado ? "CONTINUAR"
    : etapa === 3 ? "SELECIONE A CAPTURA PARA CONTINUAR" : "COPIE O LINK PARA CONTINUAR";
}

function atualizarNavegacao() {
  navegacao.forEach((botao, indice) => {
    const numero = indice + 1;
    botao.className = etapa === numero ? "current" : etapa > numero ? "done" : "";
    botao.disabled = buscando || !etapaLiberada(numero);
    botao.querySelector(".step-circle").innerHTML = etapa > numero ? icones.check : String(numero);
    if (etapa === numero) botao.setAttribute("aria-current", "step");
    else botao.removeAttribute("aria-current");
  });
}

function mostrarEtapa(numero, rolar = true) {
  if (!etapaLiberada(numero)) return;
  etapa = numero;
  const templates = ["etapa-nick", "etapa-robux", "etapa-passos", "etapa-convite", "etapa-atividade"];
  painel.replaceChildren(copiarTemplate(templates[numero - 1]));
  atualizarNavegacao();
  if (numero === 1) prepararNick();
  if (numero === 2) prepararRobux();
  if (numero === 3) prepararPassos();
  if (numero === 4) prepararConvite();
  if (numero === 5) prepararAtividade();
  if (rolar) window.scrollTo({top: 0, behavior: movimentoReduzido.matches ? "instant" : "smooth"});
}

function prepararNick() {
  prepararTutorial();
  const campo = painel.querySelector("#nickname");
  const form = painel.querySelector("form");
  campo.value = nick;
  form.onsubmit = buscarPerfil;
  const continuar = form.querySelector(".primary");
  continuar.disabled = !nick.trim();
  campo.oninput = () => {
    nick = campo.value;
    perfil = null;
    painel.querySelector(".profile-result")?.remove();
    painel.querySelector(".confirmation-actions")?.remove();
    continuar.hidden = false;
    continuar.disabled = !nick.trim();
    erro("");
    atualizarNavegacao();
  };
  if (perfil) {
    continuar.hidden = true;
    form.after(copiarTemplate("perfil-encontrado"));
    preencherPerfil();
    painel.querySelector(".confirmation-actions .secondary").onclick = () => {
      perfil = null;
      nick = "";
      mostrarEtapa(1, false);
      painel.querySelector("#nickname").focus();
    };
    painel.querySelector(".confirmation-actions .primary").onclick = () => mostrarEtapa(2);
  }
}

function prepararRobux() {
  painel.querySelector("p > strong").textContent = perfil.displayName;
  painel.querySelector(".primary").onclick = () => mostrarEtapa(3);
  painel.querySelector(".back").onclick = () => mostrarEtapa(1);
}

function prepararPassos() {
  prepararTutorial();
  painel.querySelector(".mission-name").textContent = perfil.displayName;
  painel.querySelector(".mission-link").href = enderecoSeguro(config.convite);
  painel.querySelector(".mission-copy").onclick = async () => {
    try {
      await navigator.clipboard.writeText(config.convite);
      painel.querySelector(".mission-copy").textContent = "✓ Link copiado";
      painel.querySelector(".mission-copy-status").textContent = "Convite do TikTok copiado.";
    } catch {
      const campo = painel.querySelector(".mission-address");
      campo.hidden = false;
      campo.value = config.convite;
      campo.focus();
      campo.select();
      painel.querySelector(".mission-copy-status").textContent = "Selecione e copie o link acima.";
    }
  };
  const arquivo = painel.querySelector("#proof");
  const area = painel.querySelector(".drop-zone");
  area.onclick = () => arquivo.click();
  arquivo.onchange = () => selecionarImagem(arquivo.files[0]);
  area.ondragover = evento => evento.preventDefault();
  area.ondrop = evento => {
    evento.preventDefault();
    selecionarImagem(evento.dataTransfer.files[0]);
  };
  if (imagem) desenharImagem();
  atualizarTempo();
  painel.querySelector(".next-step").onclick = () => mostrarEtapa(4);
  atualizarContinuar();
  painel.querySelector(".back").onclick = () => mostrarEtapa(2);
}

function prepararTutorial() {
  const video = painel.querySelector(".tutorial-video");
  if (video && config.video) {
    video.src = enderecoSeguro(config.video);
    video.onerror = () => {
      const aviso = document.createElement("p");
      aviso.className = "fineprint";
      aviso.textContent = "Não foi possível carregar o vídeo. Confira se a pasta midia foi extraída junto com o site.";
      video.replaceWith(aviso);
    };
  }
  const figura = painel.querySelector(".tutorial-image");
  if (figura && config.imagemTutorial) {
    figura.src = enderecoSeguro(config.imagemTutorial);
    figura.closest("a").href = figura.src;
  }
}

function atualizarTempo() {
  const relogio = painel.querySelector(".timer > b");
  if (relogio) relogio.textContent = `${String(Math.floor(segundos / 60)).padStart(2,"0")}:${String(segundos % 60).padStart(2,"0")}`;
}

function prepararConvite() {
  painel.querySelector(".invite-name").textContent = `${perfil.displayName},`;
  const convite = criarLinkConvite(perfil.name);
  const copiar = painel.querySelector(".copy-button");
  const endereco = painel.querySelector(".invite-address");
  const compartilhar = painel.querySelector(".share-button");
  const status = painel.querySelector(".copy-status");
  const indicador = painel.querySelector(".invite-state");
  if (conviteCopiado || conviteCompartilhado) indicador.textContent = conviteCompartilhado ? "COMPARTILHADO" : "COPIADO";
  if (convite) {
    endereco.value = convite;
    endereco.onfocus = () => endereco.select();
    const marcarCopiado = () => {
      conviteCopiado = true;
      erro("");
      copiar.innerHTML = icones.check + " Link copiado";
      copiar.classList.add("copied");
      indicador.textContent = "COPIADO";
      status.textContent = "Link copiado! Cole na conversa com seu amigo.";
      status.classList.add("success-status");
      atualizarContinuar();
      atualizarNavegacao();
    };
    // Se o navegador bloquear a cópia automática, copiar à mão do campo também vale.
    endereco.oncopy = marcarCopiado;
    copiar.onclick = async () => {
      try {
        await navigator.clipboard.writeText(convite);
        marcarCopiado();
      } catch {
        endereco.focus();
        endereco.select();
        erro("Selecione e copie o link exibido abaixo do botão.");
      }
    };
    compartilhar.hidden = !navigator.share;
    compartilhar.onclick = async () => {
      try {
        await navigator.share({title: "Aurora · Central de Recompensas", text: "Confira o site e as condições de participação.", url: convite});
        conviteCompartilhado = true;
        indicador.textContent = "COMPARTILHADO";
        status.textContent = "Convite compartilhado pelo seu dispositivo.";
        status.classList.add("success-status");
        atualizarContinuar();
        atualizarNavegacao();
      } catch (falha) {
        if (falha.name !== "AbortError") erro("Não foi possível compartilhar. Use Copiar link de convite.");
      }
    };
  } else {
    copiar.disabled = true;
    compartilhar.hidden = true;
    status.textContent = "O convite não está disponível.";
  }
  painel.querySelector(".next-step").onclick = () => mostrarEtapa(5);
  atualizarContinuar();
  painel.querySelector(".back").onclick = () => mostrarEtapa(3);
}

// O nick é do perfil validado pela API; o link do TikTok é independente.
function criarLinkConvite(nome) {
  if (!/^[A-Za-z0-9_]{3,20}$/.test(nome)) return "";
  try {
    const url = new URL(config.siteConvite);
    if (!['https:', 'http:'].includes(url.protocol)) return "";
    return new URL('/' + encodeURIComponent(nome), url.origin).href;
  } catch { return ""; }
}

function identificarConvite() {
  if (!["https:", "http:"].includes(location.protocol)) return;
  let origem = "";
  try { origem = decodeURIComponent(location.pathname).replace(/^\/+|\/+$/g, ""); } catch { return; }
  if (!/^[A-Za-z0-9_]{3,20}$/.test(origem)) return;
  const aviso = document.querySelector(".referral-origin");
  aviso.textContent = `Convite de @${origem}`;
  aviso.hidden = false;
  // Apenas identifica o link. Não conta indicação nem altera o nick do visitante.
}

function selecionarImagem(arquivo) {
  if (!arquivo) return;
  if (!["image/png", "image/jpeg", "image/webp"].includes(arquivo.type) || !arquivo.size || arquivo.size > 5 * 1024 * 1024) {
    erro("Escolha uma imagem PNG, JPEG ou WebP de até 5 MB.");
    return;
  }
  erro("");
  if (imagem) URL.revokeObjectURL(imagem);
  imagem = URL.createObjectURL(arquivo);
  nomeImagem = arquivo.name;
  desenharImagem();
  atualizarContinuar();
  atualizarNavegacao();
}

function desenharImagem() {
  const area = painel.querySelector(".drop-zone");
  const foto = document.createElement("img");
  foto.src = imagem;
  foto.alt = "Prévia do comprovante";
  const nome = document.createElement("strong");
  nome.textContent = nomeImagem;
  const dica = document.createElement("small");
  dica.textContent = "Toque para trocar";
  area.replaceChildren(foto, nome, dica);
}

function prepararAtividade() {
  desenharResgatesSimulados();
  painel.querySelector(".activity-summary").textContent = perfil
    ? `Campanha de 400 Robux · @${perfil.name}` : "Comece confirmando seu perfil do Roblox.";
  const progresso = [perfil ? "Perfil conferido." : "Perfil ainda não consultado."];
  if (imagem) progresso.push("Captura selecionada neste navegador.");
  if (conviteCopiado) progresso.push("Link copiado.");
  if (conviteCompartilhado) progresso.push("Convite compartilhado pelo dispositivo.");
  painel.querySelector(".local-progress").textContent = progresso.join(" ");
  painel.querySelector(".finish-button").onclick = () => {
    painel.querySelector(".activity-summary").textContent = "Você terminou de conferir as etapas desta página.";
    painel.querySelector(".finish-button").textContent = "CONCLUÍDO";
    painel.querySelector(".finish-button").disabled = true;
  };
  painel.querySelector(".restart-button").onclick = () => {
    if (imagem) URL.revokeObjectURL(imagem);
    imagem = null;
    nomeImagem = "";
    perfil = null;
    nick = "";
    segundos = 0;
    conviteCopiado = false;
    conviteCompartilhado = false;
    mostrarEtapa(1);
  };
}

function desenharResgatesSimulados() {
  const lista = painel.querySelector(".recent-rewards");
  lista.replaceChildren();
  for (const item of config.resgatesSimulados || []) {
    const linha = document.createElement("article");
    linha.className = "recent-reward";
    const avatar = document.createElement("img");
    avatar.src = enderecoSeguro(item.imagem);
    avatar.alt = "Avatar público do Roblox usado como ilustração";
    carregarAvatarCard(avatar, item);
    avatar.width = 42;
    avatar.height = 42;
    const texto = document.createElement("div");
    const nome = document.createElement("strong");
    nome.textContent = item.nome;
    const status = document.createElement("span");
    status.textContent = "Recompensa entregue";
    texto.append(nome, status);
    const valor = document.createElement("b");
    valor.className = "recent-amount";
    valor.textContent = `⬡ ${Number(item.quantidade).toLocaleString("pt-BR")}`;
    valor.setAttribute("aria-label", `${item.quantidade} Robux`);
    linha.append(avatar, texto, valor);
    lista.append(linha);
  }
}

// Reutiliza a API do usuário. Uma consulta por conta para todos os cards,
// sem consultar novamente em cada rotação dos feedbacks.
function carregarAvatarCard(imagem, item) {
  const usuario = item.avatarUsuario;
  if (!usuario || !/^[A-Za-z0-9_]{3,20}$/.test(usuario)) return;
  const chave = usuario.toLowerCase();
  if (!cacheAvataresCards.has(chave)) {
    const url = new URL(config.apiPerfil, location.href);
    url.searchParams.set("username", usuario);
    cacheAvataresCards.set(chave, consultarJSON(url.href)
      .then(dados => dados.imageUrl ? enderecoSeguro(dados.imageUrl) : "")
      .catch(() => ""));
  }
  cacheAvataresCards.get(chave).then(url => {
    if (url) imagem.src = url;
  });
}

// Feedbacks: mesma disposição e cores do original, com dados em conteudo.js.
function desenharFeedbacks() {
  const lista = document.querySelector(".feedback-list");
  const itens = config.feedbacks || [];
  lista.replaceChildren();
  const exemplos = itens.some(item => item.exemplo);
  document.querySelector(".feedback-heading h3").lastChild.textContent = exemplos ? "Quem já recebeu" : " FEEDBACKS";
  document.querySelector(".feedback-section .demo-disclosure").hidden = !exemplos;
  document.querySelector(".feedback-section").setAttribute("aria-label", exemplos ? "Quem já recebeu" : "Feedbacks");
  for (let i = 0; i < Math.min(4, itens.length); i++) {
    const item = itens[(rotacao + i) % itens.length];
    const card = document.createElement("article");
    card.className = "feedback-card";
    const avatar = document.createElement("span");
    const cor = ["pink","gold","blue","green","purple"].includes(item.cor) ? item.cor : "gold";
    avatar.className = `demo-avatar ${cor}`;
    avatar.innerHTML = icones.user;
    if (item.imagem && enderecoSeguro(item.imagem)) {
      const foto = document.createElement("img");
      foto.src = enderecoSeguro(item.imagem);
      foto.alt = "Avatar público do Roblox usado como ilustração";
      carregarAvatarCard(foto, item);
      foto.style.cssText = "width:100%;height:100%;border-radius:50%;object-fit:cover";
      foto.onerror = () => { avatar.innerHTML = icones.user; };
      avatar.replaceChildren(foto);
    }
    const corpo = document.createElement("div");
    const cabecalho = document.createElement("header");
    const nome = document.createElement("strong");
    nome.textContent = item.nome;
    cabecalho.append(nome);
    if (item.exemplo) {
      const etiqueta = document.createElement("span");
      etiqueta.textContent = "ENTREGUE";
      cabecalho.append(etiqueta);
    }
    const texto = document.createElement("p");
    texto.textContent = item.texto;
    corpo.append(cabecalho, texto);
    card.append(avatar, corpo);
    lista.append(card);
  }
  // O aviso original é explicitamente uma simulação, separado dos depoimentos.
  const aviso = document.querySelector(".reward-toast");
  const exemplosLista = itens.filter(item => item.exemplo);
  if (aviso) {
    aviso.hidden = !exemplosLista.length;
    if (exemplosLista.length) {
      const item = exemplosLista[rotacao % exemplosLista.length];
      aviso.querySelector("strong").textContent = item.nome;
      aviso.querySelector(".demo-avatar").className = `demo-avatar ${item.cor || "gold"}`;
      if (item.imagem && enderecoSeguro(item.imagem)) {
        const foto = document.createElement("img");
        foto.src = enderecoSeguro(item.imagem);
        foto.alt = "Avatar público usado como ilustração";
        foto.style.cssText = "width:100%;height:100%;border-radius:50%;object-fit:cover";
        carregarAvatarCard(foto, item);
        aviso.querySelector(".demo-avatar").replaceChildren(foto);
      }
    }
  }
}

// Eventos fixos da página.
navegacao.forEach((botao, indice) => { botao.onclick = () => mostrarEtapa(indice + 1); });
document.querySelector(".support-button").onclick = () => suporte.showModal();
suporte.querySelectorAll("button").forEach(botao => { botao.onclick = () => suporte.close(); });
suporte.onclick = evento => { if (evento.target === suporte) suporte.close(); };
document.querySelector(".dismiss").onclick = () => document.querySelector(".reward-toast").remove();
const rodape = document.querySelector("footer");
rodape.querySelector("button").onclick = () => suporte.showModal();
// Não deixa um link quebrado para um painel que foi retirado desta versão.
const admin = rodape.querySelector('a[href="/admin"]');
if (admin) {
  admin.previousElementSibling?.remove();
  admin.remove();
}
const pausar = document.querySelector(".feedback-heading button");
pausar.onclick = () => {
  pausado = !pausado;
  pausar.innerHTML = pausado ? icones.play : icones.pause;
  pausar.setAttribute("aria-pressed", String(pausado));
  pausar.setAttribute("aria-label", pausado ? "Retomar feedbacks" : "Pausar feedbacks");
};
setInterval(() => {
  if (etapa === 3 || etapa === 4) {
    segundos++;
    atualizarTempo();
  }
}, 1000);
setInterval(() => {
  if (pausado || document.hidden || movimentoReduzido.matches || !config.feedbacks.length) return;
  rotacao = (rotacao + 1) % config.feedbacks.length;
  desenharFeedbacks();
}, 8000);
window.addEventListener("pagehide", () => { if (imagem) URL.revokeObjectURL(imagem); });
mostrarEtapa(1, false);
desenharFeedbacks();
identificarConvite();
