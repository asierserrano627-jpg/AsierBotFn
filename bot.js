// ============================================================
//  BOT DE DISCORD COMPLETO - discord.js v14
//  Instala: npm install discord.js
// ============================================================

const fs = require("fs");
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  SlashCommandBuilder,
  REST,
  Routes,
  ChannelType,
  Collection,
} = require("discord.js");

// ══════════════════════════════════════════
//  CONFIGURACIÓN — edita esto
// ══════════════════════════════════════════
// Se leen de variables de entorno (en Railway: pestaña Variables).
// Para probar en local puedes ponerlas en tu terminal antes de ejecutar.
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
// Opcional: IDs de owners separados por comas. Si lo dejas vacío,
// el dueño del servidor y quien tenga el rol más alto ya cuentan como owners.
const OWNER_IDS = (process.env.OWNER_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (!TOKEN || !CLIENT_ID) {
  console.error("❌ Faltan las variables de entorno TOKEN y/o CLIENT_ID.");
  process.exit(1);
}

// ══════════════════════════════════════════
//  CONFIGURACIÓN DEL BOT (se guarda en config.json)
// ══════════════════════════════════════════
// En Railway pon CONFIG_PATH=/data/config.json y monta un volumen en /data
const CONFIG_FILE = process.env.CONFIG_PATH || "./config.json";
const DEFAULT_WELCOME = "¡Bienvenido/a **{mention}** al servidor **{server}**! 🎉";

const config = {
  welcomeChannelId: null,
  welcomeEnabled: true,
  welcomeMessage: DEFAULT_WELCOME,
  banspotChannelId: null,
  banspotEnabled: false,
  logChannelId: null,
  logEnabled: false,
  autoRoleId: null,
  autoRoleEnabled: false,
  antiSpamEnabled: false,
  antiSpamMaxMensajes: 5,
  antiSpamSegundos: 5,
  antiSpamMuteMinutos: 5,
  ownerIds: [], // owners añadidos desde el panel /settings
  ownerRoleEnabled: false, // dar automáticamente el rol más fuerte posible a los owners
  ownerByTopRoleEnabled: false, // opcional: quien tenga ahora mismo el rol más fuerte cuenta como owner
  seededGuilds: [], // servidores donde ya se añadió automáticamente al rol más fuerte como owner
};

try {
  if (fs.existsSync(CONFIG_FILE)) Object.assign(config, JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")));
} catch (e) {
  console.error("No pude leer config.json:", e);
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error("No pude guardar config.json:", e);
  }
}

const spamTracker = new Collection(); // userId -> [timestamps]
const warns = new Collection();       // userId -> [{ razon, fecha, moderador }]

// ══════════════════════════════════════════
//  CLIENTE
// ══════════════════════════════════════════
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ══════════════════════════════════════════
//  COMANDOS SLASH
// ══════════════════════════════════════════
const commands = [
  // MODERACIÓN
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Banear a un usuario")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario").setRequired(true))
    .addStringOption((o) => o.setName("razon").setDescription("Razón").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Expulsar a un usuario")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario").setRequired(true))
    .addStringOption((o) => o.setName("razon").setDescription("Razón").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Silenciar a un usuario")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario").setRequired(true))
    .addIntegerOption((o) => o.setName("minutos").setDescription("Duración en minutos").setRequired(true))
    .addStringOption((o) => o.setName("razon").setDescription("Razón").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Quitar mute a un usuario")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Advertir a un usuario")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario").setRequired(true))
    .addStringOption((o) => o.setName("razon").setDescription("Razón").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName("warns")
    .setDescription("Ver advertencias de un usuario")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  new SlashCommandBuilder()
    .setName("clearwarns")
    .setDescription("Borrar advertencias de un usuario")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Borrar mensajes del canal")
    .addIntegerOption((o) => o.setName("cantidad").setDescription("Cantidad (máx 100)").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Bloquear el canal actual")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Desbloquear el canal actual")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Poner slowmode en el canal")
    .addIntegerOption((o) => o.setName("segundos").setDescription("Segundos (0 = desactivar)").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  // UTILIDADES
  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Ver información de un usuario")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario").setRequired(false)),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Ver información del servidor"),

  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Ver el avatar de un usuario")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario").setRequired(false)),

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Ver la latencia del bot"),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Hacer que el bot diga algo")
    .addStringOption((o) => o.setName("mensaje").setDescription("Mensaje").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Crear un embed personalizado")
    .addStringOption((o) => o.setName("titulo").setDescription("Título").setRequired(true))
    .addStringOption((o) => o.setName("descripcion").setDescription("Descripción").setRequired(true))
    .addStringOption((o) => o.setName("color").setDescription("Color hex (ej: #ff0000)").setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName("botinfo")
    .setDescription("Ver información del bot"),

  // ROLES
  new SlashCommandBuilder()
    .setName("roles")
    .setDescription("Mostrar panel de roles con botones")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // BANSPOT
  new SlashCommandBuilder()
    .setName("banspot")
    .setDescription("Crear canal BansPot trampa anti-bots")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  // SETTINGS — Solo owners
  new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Panel de configuración del bot (solo owners)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

// ══════════════════════════════════════════
//  REGISTRAR COMANDOS
// ══════════════════════════════════════════
async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  try {
    console.log("Registrando comandos slash...");
    // Los comandos se ven para todos; los permisos se comprueban en el código
    // (así quien tenga el rol más fuerte puede usarlos aunque Discord no le dé el permiso).
    commands.forEach((c) => c.setDefaultMemberPermissions(null));
    await rest.put(Routes.applicationCommands(CLIENT_ID), {
      body: commands.map((c) => c.toJSON()),
    });
    console.log("✅ Comandos registrados.");
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// ══════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════
// Es owner si: está en el código, fue añadido desde el panel,
// o es el dueño del servidor de Discord.
function isOwner(userId, guild = null) {
  return (
    OWNER_IDS.includes(userId) ||
    config.ownerIds.includes(userId) ||
    (guild && guild.ownerId === userId) ||
    (config.ownerByTopRoleEnabled && guild && hasTopRole(guild, userId))
  );
}

// Rol más fuerte del servidor y rol más fuerte que el bot PUEDE asignar.
// Discord no permite que un bot dé roles iguales o superiores a su rol más alto.
function getRoleInfo(guild) {
  const me = guild.members.me;
  const roles = [...guild.roles.cache.values()]
    .filter((r) => r.id !== guild.id && !r.managed)
    .sort((a, b) => b.position - a.position);
  // El rol más fuerte que tenga al menos una persona (se ignoran roles de bots/apps)
  const top = roles.find((r) => r.members.some((m) => !m.user.bot)) || null;
  const assignable = me ? roles.find((r) => r.position < me.roles.highest.position) || null : null;
  return { top, assignable };
}

// ¿Tiene este usuario el rol más fuerte del servidor?
// Por seguridad, si demasiada gente tiene ese rol (ej. un rol "Miembro"), no cuenta.
const MAX_TOP_ROLE_HOLDERS = 10;
function hasTopRole(guild, userId) {
  const { top } = getRoleInfo(guild);
  if (!top || [...top.members.values()].filter((m) => !m.user.bot).length > MAX_TOP_ROLE_HOLDERS) return false;
  const m = guild.members.cache.get(userId);
  return !!(m && !m.user.bot && m.roles.cache.has(top.id));
}

// Cuando el bot entra en un servidor: añade como owners a quienes tienen el rol
// más fuerte. Solo se hace una vez por servidor; después se gestiona desde /settings.
async function seedOwners(guild) {
  if (config.seededGuilds.includes(guild.id)) return;
  await guild.members.fetch().catch(() => {});
  const { top } = getRoleInfo(guild);
  if (!top || [...top.members.values()].filter((m) => !m.user.bot).length > MAX_TOP_ROLE_HOLDERS) return; // demasiada gente: no se hace por seguridad
  for (const m of top.members.values()) {
    if (!m.user.bot && !config.ownerIds.includes(m.id)) config.ownerIds.push(m.id);
  }
  config.seededGuilds.push(guild.id);
  saveConfig();
  console.log(`👑 Owners añadidos automáticamente en ${guild.name} (rol: ${top.name})`);
}

// Da a todos los owners el rol más fuerte que el bot puede asignar
async function applyOwnerRole(guild) {
  const { assignable } = getRoleInfo(guild);
  if (!assignable) return null;
  const ids = [...new Set([...OWNER_IDS.filter((id) => !id.startsWith("AQUI")), ...config.ownerIds])];
  for (const id of ids) {
    const m = await guild.members.fetch(id).catch(() => null);
    if (m && !m.roles.cache.has(assignable.id)) await m.roles.add(assignable).catch(() => {});
  }
  return assignable;
}

function successEmbed(title, desc) {
  return new EmbedBuilder().setColor(0x00ff88).setTitle(`✅ ${title}`).setDescription(desc).setTimestamp();
}

function errorEmbed(title, desc) {
  return new EmbedBuilder().setColor(0xff3333).setTitle(`❌ ${title}`).setDescription(desc).setTimestamp();
}

function infoEmbed(title, desc) {
  return new EmbedBuilder().setColor(0x5865f2).setTitle(`ℹ️ ${title}`).setDescription(desc).setTimestamp();
}

async function sendLog(guild, embed) {
  if (!config.logEnabled || !config.logChannelId) return;
  const canal = guild.channels.cache.get(config.logChannelId);
  if (canal) canal.send({ embeds: [embed] }).catch(() => {});
}

async function createBanspotChannel(guild) {
  const canal = await guild.channels.create({
    name: "banspot",
    type: ChannelType.GuildText,
    topic: "🚨 Canal trampa anti-bots — Si escribes aquí serás baneado.",
    permissionOverwrites: [
      { id: guild.roles.everyone, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
    ],
  });
  config.banspotChannelId = canal.id;
  config.banspotEnabled = true;
  saveConfig();

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("🚫 ¡NO ESCRIBAS AQUÍ!")
    .setDescription(
      "## ⛔ ZONA PROHIBIDA\n\n" +
      "**Si escribes en este canal serás baneado automáticamente.**\n\n" +
      "Este canal existe para detectar y eliminar bots automáticos.\n" +
      "Los bots suelen escribir en todos los canales disponibles.\n\n" +
      "> **Esto es una trampa. No hay segunda oportunidad.**\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━\n" +
      "🔨 El ban es **inmediato, automático y sin apelación.**\n" +
      "━━━━━━━━━━━━━━━━━━━━━━"
    )
    .setImage("https://i.postimg.cc/3RTytys2/file-000000000df481f4970d613cee995dca.png")
    .setFooter({ text: "BansPot — Sistema anti-bots • Solo los admins están protegidos" })
    .setTimestamp();

  await canal.send({ embeds: [embed] });
  return canal;
}

// ══════════════════════════════════════════
//  PANEL DE SETTINGS — PÁGINAS
//  (cada página devuelve { embeds, components })
// ══════════════════════════════════════════
const estadoTxt = (on) => (on ? "🟢 Activado" : "🔴 Desactivado");
const canalTxt = (id) => (id ? `<#${id}>` : "❌ No configurado");

function toggleButton(customId, on) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(on ? "Desactivar" : "Activar")
    .setEmoji(on ? "🔴" : "🟢")
    .setStyle(on ? ButtonStyle.Danger : ButtonStyle.Success);
}

function navRow(current) {
  const opciones = [
    { label: "Inicio", emoji: "🏠", description: "Volver al inicio", value: "inicio" },
    { label: "Bienvenida", emoji: "🟢", description: "Canal y mensaje de bienvenida", value: "bienvenida" },
    { label: "BansPot", emoji: "🔴", description: "Sistema trampa anti-bots", value: "banspot" },
    { label: "Logs", emoji: "📋", description: "Canal de registros", value: "logs" },
    { label: "Rol automático", emoji: "🏷️", description: "Rol al entrar al servidor", value: "roles" },
    { label: "Anti-Spam", emoji: "🛡️", description: "Protección contra spam", value: "antispam" },
    { label: "Owners", emoji: "👑", description: "Quién puede usar /settings", value: "owners" },
    { label: "Estado", emoji: "📊", description: "Ver toda la configuración", value: "estado" },
  ].map((o) => ({ ...o, default: o.value === current }));

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("settings_menu")
      .setPlaceholder("📂 Selecciona una página...")
      .addOptions(opciones)
  );
}

function getSettingsPage(page) {
  switch (page) {
    case "bienvenida":
      return {
        embeds: [
          new EmbedBuilder()
            .setColor(0x00ff88)
            .setTitle("🟢 Configuración — Bienvenida")
            .setDescription(
              `**Estado:** ${estadoTxt(config.welcomeEnabled)}\n` +
              `**Canal:** ${canalTxt(config.welcomeChannelId)}\n\n` +
              `**Mensaje actual:**\n${config.welcomeMessage}\n\n` +
              "**Variables:** `{user}` nombre · `{mention}` mención · `{server}` servidor · `{count}` nº de miembros"
            )
            .setTimestamp(),
        ],
        components: [
          navRow("bienvenida"),
          new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
              .setCustomId("cfg_welcome_channel")
              .setPlaceholder("📢 Elige el canal de bienvenida...")
              .setChannelTypes([ChannelType.GuildText, ChannelType.GuildAnnouncement])
          ),
          new ActionRowBuilder().addComponents(
            toggleButton("cfg_welcome_toggle", config.welcomeEnabled),
            new ButtonBuilder().setCustomId("cfg_welcome_msg_edit").setLabel("Editar mensaje").setEmoji("✏️").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("cfg_welcome_msg_default").setLabel("Mensaje por defecto").setEmoji("🔄").setStyle(ButtonStyle.Secondary)
          ),
        ],
      };

    case "banspot":
      return {
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle("🔴 Configuración — BansPot")
            .setDescription(
              `**Estado:** ${estadoTxt(config.banspotEnabled)}\n` +
              `**Canal trampa:** ${config.banspotChannelId ? `<#${config.banspotChannelId}>` : "❌ No creado"}\n\n` +
              "⚠️ Cualquier usuario que escriba en el canal BansPot será **baneado automáticamente**.\n" +
              "Los admins y owners están protegidos."
            )
            .setTimestamp(),
        ],
        components: [
          navRow("banspot"),
          new ActionRowBuilder().addComponents(
            toggleButton("cfg_banspot_toggle", config.banspotEnabled),
            new ButtonBuilder().setCustomId("cfg_banspot_create").setLabel("Crear canal").setEmoji("🔨").setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId("cfg_banspot_delete").setLabel("Eliminar canal").setEmoji("🗑️").setStyle(ButtonStyle.Danger)
          ),
        ],
      };

    case "logs":
      return {
        embeds: [
          new EmbedBuilder()
            .setColor(0xffaa00)
            .setTitle("📋 Configuración — Logs")
            .setDescription(
              `**Estado:** ${estadoTxt(config.logEnabled)}\n` +
              `**Canal de logs:** ${canalTxt(config.logChannelId)}\n\n` +
              "Se registran: bans, kicks, mutes, warns y mensajes eliminados."
            )
            .setTimestamp(),
        ],
        components: [
          navRow("logs"),
          new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
              .setCustomId("cfg_log_channel")
              .setPlaceholder("📋 Elige el canal de logs...")
              .setChannelTypes([ChannelType.GuildText])
          ),
          new ActionRowBuilder().addComponents(toggleButton("cfg_log_toggle", config.logEnabled)),
        ],
      };

    case "roles":
      return {
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🏷️ Configuración — Rol Automático")
            .setDescription(
              `**Estado:** ${estadoTxt(config.autoRoleEnabled)}\n` +
              `**Rol al entrar:** ${config.autoRoleId ? `<@&${config.autoRoleId}>` : "❌ No configurado"}\n\n` +
              "Cuando alguien entra al servidor se le asigna este rol automáticamente.\n" +
              "⚠️ El rol del bot debe estar **por encima** de este rol."
            )
            .setTimestamp(),
        ],
        components: [
          navRow("roles"),
          new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder().setCustomId("cfg_autorole_role").setPlaceholder("🏷️ Elige el rol automático...")
          ),
          new ActionRowBuilder().addComponents(toggleButton("cfg_autorole_toggle", config.autoRoleEnabled)),
        ],
      };

    case "antispam":
      return {
        embeds: [
          new EmbedBuilder()
            .setColor(0xff6600)
            .setTitle("🛡️ Configuración — Anti-Spam")
            .setDescription(
              `**Estado:** ${estadoTxt(config.antiSpamEnabled)}\n` +
              `**Límite:** ${config.antiSpamMaxMensajes} mensajes en ${config.antiSpamSegundos} segundos\n` +
              `**Castigo:** mute de ${config.antiSpamMuteMinutos} minutos\n\n` +
              "Si alguien supera el límite, será muteado automáticamente.\nLos admins no se ven afectados."
            )
            .setTimestamp(),
        ],
        components: [
          navRow("antispam"),
          new ActionRowBuilder().addComponents(
            toggleButton("cfg_antispam_toggle", config.antiSpamEnabled)
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("cfg_antispam_msg_down").setLabel("Mensajes −").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("cfg_antispam_msg_up").setLabel("Mensajes +").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("cfg_antispam_sec_down").setLabel("Segundos −").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("cfg_antispam_sec_up").setLabel("Segundos +").setStyle(ButtonStyle.Secondary)
          ),
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("cfg_antispam_mute_down").setLabel("Mute −").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId("cfg_antispam_mute_up").setLabel("Mute +").setStyle(ButtonStyle.Secondary)
          ),
        ],
      };

    case "owners": {
      const extras = config.ownerIds;
      const fijos = OWNER_IDS.filter((id) => !id.startsWith("AQUI"));
      const components = [
        navRow("owners"),
        new ActionRowBuilder().addComponents(
          new UserSelectMenuBuilder()
            .setCustomId("cfg_owner_add")
            .setPlaceholder("➕ Añadir owners...")
            .setMinValues(1)
            .setMaxValues(5)
        ),
      ];
      if (extras.length > 0) {
        components.push(
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId("cfg_owner_remove")
              .setPlaceholder("➖ Quitar owners...")
              .setMinValues(1)
              .setMaxValues(Math.min(extras.length, 25))
              .addOptions(
                extras.slice(0, 25).map((id) => ({
                  label: client.users.cache.get(id)?.username || id,
                  description: `ID: ${id}`,
                  value: id,
                }))
              )
          )
        );
      }
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("cfg_owner_id_btn").setLabel("Añadir por ID").setEmoji("🆔").setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId("cfg_owner_role_toggle")
            .setLabel(config.ownerRoleEnabled ? "Desactivar rol auto" : "Activar rol auto")
            .setEmoji(config.ownerRoleEnabled ? "🔴" : "🟢")
            .setStyle(config.ownerRoleEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
          new ButtonBuilder().setCustomId("cfg_owner_role_apply").setLabel("Aplicar ahora").setEmoji("⚡").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId("cfg_owner_top_toggle")
            .setLabel(config.ownerByTopRoleEnabled ? "Owner por rango: ON" : "Owner por rango: OFF")
            .setEmoji("👑")
            .setStyle(config.ownerByTopRoleEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
        )
      );

      const g = client.guilds.cache.first();
      let rolInfo = "No disponible.";
      let topInfo = "No disponible.";
      if (g) {
        const { top, assignable } = getRoleInfo(g);
        const holders = top ? [...top.members.values()].filter((m) => !m.user.bot).map((m) => `<@${m.id}>`) : [];
        topInfo =
          `**Estado:** ${estadoTxt(config.ownerByTopRoleEnabled)}\n` +
          `**Rol más fuerte:** ${top ? `<@&${top.id}>` : "ninguno"}\n` +
          `**Lo tienen:** ${holders.length ? holders.join(", ") : "nadie"}`;
        if (top && holders.length > MAX_TOP_ROLE_HOLDERS) {
          topInfo += `\n⚠️ Más de ${MAX_TOP_ROLE_HOLDERS} personas tienen ese rol, así que no se aplica (por seguridad).`;
        }
        rolInfo =
          `**Estado:** ${estadoTxt(config.ownerRoleEnabled)}\n` +
          `**Rol más fuerte del servidor:** ${top ? `<@&${top.id}>` : "ninguno"}\n` +
          `**Rol más fuerte que puedo asignar:** ${assignable ? `<@&${assignable.id}>` : "ninguno"}`;
        if (top && (!assignable || assignable.id !== top.id)) {
          rolInfo +=
            "\n⚠️ Mi rol está por debajo del rol más fuerte. Discord no deja que un bot dé roles superiores al suyo: " +
            "sube el rol del bot en *Ajustes del servidor → Roles* para que pueda darlo.";
        }
      }

      return {
        embeds: [
          new EmbedBuilder()
            .setColor(0xffd700)
            .addFields(
              { name: "🎖️ Rol automático para owners", value: rolInfo },
              { name: "👑 Owner por rango más fuerte", value: topInfo }
            )
            .setTitle("👑 Configuración — Owners")
            .setDescription(
              "Solo los owners pueden usar los comandos del bot y están protegidos de ban/kick/mute.\n" +
              "Al entrar el bot a un servidor, añade solo a quien tiene el rol más fuerte; después puedes añadir o quitar owners aquí.\n\n" +
              `**Dueño del servidor:** siempre es owner\n` +
              `**Fijos (en el código):** ${fijos.length ? fijos.map((id) => `<@${id}>`).join(", ") : "ninguno"}\n` +
              `**Añadidos desde el panel:** ${extras.length ? extras.map((id) => `<@${id}>`).join(", ") : "ninguno"}`
            )
            .setTimestamp(),
        ],
        components,
      };
    }

    case "estado":
      return {
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("📊 Estado completo de la configuración")
            .addFields(
              { name: "🟢 Bienvenida", value: `${estadoTxt(config.welcomeEnabled)} — ${canalTxt(config.welcomeChannelId)}` },
              { name: "🔴 BansPot", value: `${estadoTxt(config.banspotEnabled)} — ${config.banspotChannelId ? `<#${config.banspotChannelId}>` : "Sin canal"}` },
              { name: "📋 Logs", value: `${estadoTxt(config.logEnabled)} — ${canalTxt(config.logChannelId)}` },
              { name: "🏷️ Rol automático", value: `${estadoTxt(config.autoRoleEnabled)} — ${config.autoRoleId ? `<@&${config.autoRoleId}>` : "Sin rol"}` },
              { name: "🛡️ Anti-Spam", value: `${estadoTxt(config.antiSpamEnabled)} — ${config.antiSpamMaxMensajes} msgs/${config.antiSpamSegundos}s → mute ${config.antiSpamMuteMinutos} min` }
            )
            .setTimestamp(),
        ],
        components: [navRow("estado")],
      };

    default:
      return {
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("⚙️ Panel de Configuración")
            .setDescription(
              "Desde aquí puedes configurar todo el bot sin tocar el código.\n" +
              "Solo tú ves este panel.\n\n" +
              "**Selecciona una página en el menú de abajo:**\n\n" +
              "🟢 **Bienvenida** — Canal y mensaje\n" +
              "🔴 **BansPot** — Sistema anti-bots\n" +
              "📋 **Logs** — Canal de registros\n" +
              "🏷️ **Rol automático** — Rol al entrar\n" +
              "🛡️ **Anti-Spam** — Límites y castigo\n" +
              "👑 **Owners** — Quién puede usar este panel\n" +
              "📊 **Estado** — Ver toda la configuración"
            )
            .setFooter({ text: "Panel exclusivo para owners" })
            .setTimestamp(),
        ],
        components: [navRow("inicio")],
      };
  }
}

// ══════════════════════════════════════════
//  EVENTO: BOT LISTO
// ══════════════════════════════════════════
client.once("ready", async () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
  client.user.setActivity("🛡️ Protegiendo el servidor", { type: 3 });
  // Cargar miembros para poder detectar quién tiene el rol más fuerte
  for (const g of client.guilds.cache.values()) {
    await g.members.fetch().catch(() => {});
    await seedOwners(g).catch(console.error);
  }
  await registerCommands();
});

// ══════════════════════════════════════════
//  EVENTO: NUEVO MIEMBRO
// ══════════════════════════════════════════
client.on("guildCreate", (guild) => {
  seedOwners(guild).catch(console.error);
});

client.on("guildMemberAdd", async (member) => {
  // Owners que vuelven al servidor recuperan su rol fuerte
  if (config.ownerRoleEnabled && (OWNER_IDS.includes(member.id) || config.ownerIds.includes(member.id))) {
    applyOwnerRole(member.guild).catch(() => {});
  }

  if (config.autoRoleEnabled && config.autoRoleId) {
    const role = member.guild.roles.cache.get(config.autoRoleId);
    if (role) member.roles.add(role).catch(() => {});
  }

  if (!config.welcomeEnabled || !config.welcomeChannelId) return;
  const channel = member.guild.channels.cache.get(config.welcomeChannelId);
  if (!channel) return;

  const msg = config.welcomeMessage
    .replaceAll("{user}", member.user.username)
    .replaceAll("{mention}", `${member}`)
    .replaceAll("{server}", member.guild.name)
    .replaceAll("{count}", `${member.guild.memberCount}`);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("👋 ¡Nuevo miembro!")
    .setDescription(msg)
    .setThumbnail(member.user.displayAvatarURL())
    .setFooter({ text: `Miembro #${member.guild.memberCount}` })
    .setTimestamp();

  channel.send({ embeds: [embed] }).catch(() => {});
});

// ══════════════════════════════════════════
//  EVENTO: MENSAJE ELIMINADO (logs)
// ══════════════════════════════════════════
client.on("messageDelete", async (message) => {
  if (!message.guild || message.author?.bot) return;
  if (message.channel.id === config.banspotChannelId) return;
  await sendLog(
    message.guild,
    new EmbedBuilder()
      .setColor(0x888888)
      .setTitle("🗑️ Mensaje eliminado")
      .setDescription(
        `**Autor:** ${message.author ? message.author.tag : "Desconocido"}\n` +
        `**Canal:** ${message.channel}\n` +
        `**Contenido:** ${message.content ? message.content.slice(0, 1000) : "*No disponible*"}`
      )
      .setTimestamp()
  );
});

// ══════════════════════════════════════════
//  EVENTO: MENSAJES (BansPot + Anti-Spam)
// ══════════════════════════════════════════
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  const isAdmin =
    message.member?.permissions.has(PermissionFlagsBits.Administrator) ||
    message.guild.ownerId === message.author.id ||
    isOwner(message.author.id, message.guild);

  // ── BansPot ──
  if (config.banspotEnabled && config.banspotChannelId && message.channel.id === config.banspotChannelId) {
    if (isAdmin) {
      await message.delete().catch(() => {});
      return;
    }
    try {
      await message.delete().catch(() => {});
      await message.guild.members.ban(message.author.id, {
        reason: "🚨 Escribió en canal BansPot (trampa anti-bots)",
        deleteMessageSeconds: 60,
      });
      message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle("🔨 ¡BAN EJECUTADO!")
            .setDescription(`**${message.author.username}** fue baneado automáticamente por escribir en BansPot.`)
            .setTimestamp(),
        ],
      });
      await sendLog(
        message.guild,
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("🔨 Ban — BansPot")
          .setDescription(`**Usuario:** ${message.author.tag}\n**ID:** ${message.author.id}\n**Razón:** Escribió en canal BansPot`)
          .setTimestamp()
      );
    } catch (err) {
      console.error("Error BansPot:", err);
    }
    return;
  }

  // ── Anti-Spam ──
  if (config.antiSpamEnabled && !isAdmin) {
    const now = Date.now();
    const timestamps = (spamTracker.get(message.author.id) || []).filter(
      (t) => now - t < config.antiSpamSegundos * 1000
    );
    timestamps.push(now);
    spamTracker.set(message.author.id, timestamps);

    if (timestamps.length >= config.antiSpamMaxMensajes) {
      spamTracker.delete(message.author.id);
      try {
        await message.member.timeout(config.antiSpamMuteMinutos * 60 * 1000, "Anti-Spam automático");
        message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xff6600)
              .setTitle("🛡️ Anti-Spam activado")
              .setDescription(`${message.author} fue muteado ${config.antiSpamMuteMinutos} minutos por spam.`)
              .setTimestamp(),
          ],
        });
        await sendLog(
          message.guild,
          new EmbedBuilder()
            .setColor(0xff6600)
            .setTitle("🛡️ Mute — Anti-Spam")
            .setDescription(`**Usuario:** ${message.author.tag}\n**Razón:** Spam automático`)
            .setTimestamp()
        );
      } catch {}
    }
  }
});

// ══════════════════════════════════════════
//  INTERACCIONES
// ══════════════════════════════════════════
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));


client.on("interactionCreate", async (interaction) => {
  // ─── COMPONENTES Y MODALES DEL PANEL DE SETTINGS (solo owners) ───
  const customId = interaction.customId;
  const esSettings =
    customId && (customId === "settings_menu" || customId.startsWith("cfg_"));

  if (esSettings) {
    if (!isOwner(interaction.user.id, interaction.guild)) {
      return interaction.reply({ content: "❌ Solo los owners pueden usar esto.", ephemeral: true });
    }

    // Menú de navegación entre páginas
    if (interaction.isStringSelectMenu() && customId === "settings_menu") {
      return interaction.update(getSettingsPage(interaction.values[0]));
    }

    // Quitar owners añadidos desde el panel
    if (interaction.isStringSelectMenu() && customId === "cfg_owner_remove") {
      config.ownerIds = config.ownerIds.filter((id) => !interaction.values.includes(id));
      saveConfig();
      return interaction.update(getSettingsPage("owners"));
    }

    // Añadir owners
    if (interaction.isUserSelectMenu() && customId === "cfg_owner_add") {
      for (const u of interaction.users.values()) {
        if (u.bot) continue;
        if (!config.ownerIds.includes(u.id)) config.ownerIds.push(u.id);
      }
      saveConfig();
      if (config.ownerRoleEnabled) await applyOwnerRole(interaction.guild);
      return interaction.update(getSettingsPage("owners"));
    }

    // Selectores de canal
    if (interaction.isChannelSelectMenu()) {
      const canalId = interaction.values[0];
      if (customId === "cfg_welcome_channel") {
        config.welcomeChannelId = canalId;
        saveConfig();
        return interaction.update(getSettingsPage("bienvenida"));
      }
      if (customId === "cfg_log_channel") {
        config.logChannelId = canalId;
        saveConfig();
        return interaction.update(getSettingsPage("logs"));
      }
    }

    // Selector de rol
    if (interaction.isRoleSelectMenu() && customId === "cfg_autorole_role") {
      config.autoRoleId = interaction.values[0];
      saveConfig();
      return interaction.update(getSettingsPage("roles"));
    }

    // Modal: añadir owner por ID
    if (interaction.isModalSubmit() && customId === "cfg_owner_id_modal") {
      const id = interaction.fields.getTextInputValue("uid").trim();
      const usuario = /^\d{17,20}$/.test(id) ? await client.users.fetch(id).catch(() => null) : null;
      if (!usuario || usuario.bot) {
        return interaction.reply({ content: "❌ ID no válido o usuario no encontrado.", ephemeral: true });
      }
      if (!config.ownerIds.includes(id)) config.ownerIds.push(id);
      saveConfig();
      if (config.ownerRoleEnabled) await applyOwnerRole(interaction.guild);
      if (interaction.isFromMessage()) return interaction.update(getSettingsPage("owners"));
      return interaction.reply({ content: `✅ **${usuario.username}** añadido como owner.`, ephemeral: true });
    }

    // Modal: editar mensaje de bienvenida
    if (interaction.isModalSubmit() && customId === "cfg_welcome_msg_modal") {
      config.welcomeMessage = interaction.fields.getTextInputValue("msg");
      saveConfig();
      if (interaction.isFromMessage()) return interaction.update(getSettingsPage("bienvenida"));
      return interaction.reply({ content: "✅ Mensaje actualizado.", ephemeral: true });
    }

    // Botones
    if (interaction.isButton()) {
      // Abrir modal (no se puede combinar con update)
      if (customId === "cfg_welcome_msg_edit") {
        const modal = new ModalBuilder()
          .setCustomId("cfg_welcome_msg_modal")
          .setTitle("Mensaje de bienvenida")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("msg")
                .setLabel("Mensaje")
                .setStyle(TextInputStyle.Paragraph)
                .setValue(config.welcomeMessage.slice(0, 1000))
                .setMaxLength(1000)
                .setRequired(true)
            )
          );
        return interaction.showModal(modal);
      }

      // Abrir modal para añadir owner por ID
      if (customId === "cfg_owner_id_btn") {
        const modal = new ModalBuilder()
          .setCustomId("cfg_owner_id_modal")
          .setTitle("Añadir owner por ID")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("uid")
                .setLabel("ID de usuario de Discord")
                .setStyle(TextInputStyle.Short)
                .setMinLength(17)
                .setMaxLength(20)
                .setRequired(true)
            )
          );
        return interaction.showModal(modal);
      }

      // Crear canal BansPot
      if (customId === "cfg_banspot_create") {
        await interaction.deferUpdate();
        try {
          await createBanspotChannel(interaction.guild);
        } catch (e) {
          console.error(e);
        }
        return interaction.editReply(getSettingsPage("banspot"));
      }

      // Acciones simples que modifican config y vuelven a pintar la página
      const acciones = {
        cfg_welcome_toggle: ["bienvenida", () => (config.welcomeEnabled = !config.welcomeEnabled)],
        cfg_welcome_msg_default: ["bienvenida", () => (config.welcomeMessage = DEFAULT_WELCOME)],
        cfg_banspot_toggle: ["banspot", () => (config.banspotEnabled = !config.banspotEnabled)],
        cfg_banspot_delete: [
          "banspot",
          async () => {
            if (config.banspotChannelId) {
              const canal = interaction.guild.channels.cache.get(config.banspotChannelId);
              if (canal) await canal.delete().catch(() => {});
              config.banspotChannelId = null;
              config.banspotEnabled = false;
            }
          },
        ],
        cfg_log_toggle: ["logs", () => (config.logEnabled = !config.logEnabled)],
        cfg_autorole_toggle: ["roles", () => (config.autoRoleEnabled = !config.autoRoleEnabled)],
        cfg_owner_role_toggle: [
          "owners",
          async () => {
            config.ownerRoleEnabled = !config.ownerRoleEnabled;
            if (config.ownerRoleEnabled) await applyOwnerRole(interaction.guild);
          },
        ],
        cfg_owner_role_apply: ["owners", async () => { await applyOwnerRole(interaction.guild); }],
        cfg_owner_top_toggle: [
          "owners",
          async () => {
            config.ownerByTopRoleEnabled = !config.ownerByTopRoleEnabled;
            if (config.ownerByTopRoleEnabled) await interaction.guild.members.fetch().catch(() => {});
          },
        ],
        cfg_antispam_toggle: ["antispam", () => (config.antiSpamEnabled = !config.antiSpamEnabled)],
        cfg_antispam_msg_up: ["antispam", () => (config.antiSpamMaxMensajes = clamp(config.antiSpamMaxMensajes + 1, 2, 20))],
        cfg_antispam_msg_down: ["antispam", () => (config.antiSpamMaxMensajes = clamp(config.antiSpamMaxMensajes - 1, 2, 20))],
        cfg_antispam_sec_up: ["antispam", () => (config.antiSpamSegundos = clamp(config.antiSpamSegundos + 1, 1, 60))],
        cfg_antispam_sec_down: ["antispam", () => (config.antiSpamSegundos = clamp(config.antiSpamSegundos - 1, 1, 60))],
        cfg_antispam_mute_up: ["antispam", () => (config.antiSpamMuteMinutos = clamp(config.antiSpamMuteMinutos + 1, 1, 1440))],
        cfg_antispam_mute_down: ["antispam", () => (config.antiSpamMuteMinutos = clamp(config.antiSpamMuteMinutos - 1, 1, 1440))],
      };

      const accion = acciones[customId];
      if (accion) {
        await accion[1]();
        saveConfig();
        return interaction.update(getSettingsPage(accion[0]));
      }
    }
    return;
  }

  // ─── BOTONES DEL PANEL DE ROLES (públicos) ───
  if (interaction.isButton() && interaction.customId.startsWith("rol_")) {
    const roleName = interaction.customId.replace("rol_", "");
    const role = interaction.guild.roles.cache.find((r) => r.name === roleName);
    if (!role) return interaction.reply({ content: "❌ Rol no encontrado.", ephemeral: true });
    const member = interaction.member;
    try {
      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role);
        return interaction.reply({ content: `✅ Te quité el rol **${roleName}**.`, ephemeral: true });
      }
      await member.roles.add(role);
      return interaction.reply({ content: `✅ Te di el rol **${roleName}**.`, ephemeral: true });
    } catch {
      return interaction.reply({ content: "❌ No pude cambiar tu rol. Revisa mis permisos.", ephemeral: true });
    }
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName, guild, member, user, options } = interaction;

  // TODOS los comandos son solo para owners
  if (!isOwner(user.id, guild)) {
    return interaction.reply({ embeds: [errorEmbed("Sin permiso", "Solo los owners pueden usar los comandos de este bot.")], ephemeral: true });
  }

  // ══════════════════════════════════════════
  //  MODERACIÓN
  // ══════════════════════════════════════════

  if (commandName === "ban") {
    const target = options.getMember("usuario");
    const razon = options.getString("razon") || "Sin razón";
    if (!target) return interaction.reply({ embeds: [errorEmbed("Error", "Usuario no encontrado.")], ephemeral: true });
    if (isOwner(target.user.id, guild)) return interaction.reply({ embeds: [errorEmbed("Error", "No puedes banear a un owner.")], ephemeral: true });
    try {
      await target.ban({ reason: razon });
      await sendLog(guild, new EmbedBuilder().setColor(0xff0000).setTitle("🔨 Ban").setDescription(`**Usuario:** ${target.user.tag}\n**Razón:** ${razon}\n**Por:** ${user.tag}`).setTimestamp());
      return interaction.reply({ embeds: [successEmbed("Ban ejecutado", `**${target.user.username}** baneado.\n📋 Razón: ${razon}`)] });
    } catch {
      return interaction.reply({ embeds: [errorEmbed("Error", "No pude banear.")], ephemeral: true });
    }
  }

  if (commandName === "kick") {
    const target = options.getMember("usuario");
    const razon = options.getString("razon") || "Sin razón";
    if (!target) return interaction.reply({ embeds: [errorEmbed("Error", "Usuario no encontrado.")], ephemeral: true });
    if (isOwner(target.user.id, guild)) return interaction.reply({ embeds: [errorEmbed("Error", "No puedes kickear a un owner.")], ephemeral: true });
    try {
      await target.kick(razon);
      await sendLog(guild, new EmbedBuilder().setColor(0xff6600).setTitle("👢 Kick").setDescription(`**Usuario:** ${target.user.tag}\n**Razón:** ${razon}\n**Por:** ${user.tag}`).setTimestamp());
      return interaction.reply({ embeds: [successEmbed("Kick ejecutado", `**${target.user.username}** expulsado.\n📋 Razón: ${razon}`)] });
    } catch {
      return interaction.reply({ embeds: [errorEmbed("Error", "No pude expulsar.")], ephemeral: true });
    }
  }

  if (commandName === "mute") {
    const target = options.getMember("usuario");
    const minutos = options.getInteger("minutos");
    const razon = options.getString("razon") || "Sin razón";
    if (!target) return interaction.reply({ embeds: [errorEmbed("Error", "Usuario no encontrado.")], ephemeral: true });
    if (isOwner(target.user.id, guild)) return interaction.reply({ embeds: [errorEmbed("Error", "No puedes mutear a un owner.")], ephemeral: true });
    try {
      await target.timeout(minutos * 60 * 1000, razon);
      await sendLog(guild, new EmbedBuilder().setColor(0xffaa00).setTitle("🔇 Mute").setDescription(`**Usuario:** ${target.user.tag}\n**Duración:** ${minutos} min\n**Por:** ${user.tag}`).setTimestamp());
      return interaction.reply({ embeds: [successEmbed("Mute aplicado", `**${target.user.username}** muteado **${minutos} minutos**.\n📋 Razón: ${razon}`)] });
    } catch {
      return interaction.reply({ embeds: [errorEmbed("Error", "No pude mutear.")], ephemeral: true });
    }
  }

  if (commandName === "unmute") {
    const target = options.getMember("usuario");
    if (!target) return interaction.reply({ embeds: [errorEmbed("Error", "Usuario no encontrado.")], ephemeral: true });
    try {
      await target.timeout(null);
      return interaction.reply({ embeds: [successEmbed("Unmute", `**${target.user.username}** ya puede hablar.`)] });
    } catch {
      return interaction.reply({ embeds: [errorEmbed("Error", "No pude quitar el mute.")], ephemeral: true });
    }
  }

  if (commandName === "warn") {
    const target = options.getUser("usuario");
    const razon = options.getString("razon");
    if (!warns.has(target.id)) warns.set(target.id, []);
    warns.get(target.id).push({ razon, fecha: new Date().toLocaleDateString("es-ES"), moderador: user.username });
    await sendLog(guild, new EmbedBuilder().setColor(0xffaa00).setTitle("⚠️ Warn").setDescription(`**Usuario:** ${target.tag}\n**Razón:** ${razon}\n**Por:** ${user.tag}`).setTimestamp());
    return interaction.reply({ embeds: [successEmbed("Advertencia enviada", `**${target.username}** tiene **${warns.get(target.id).length} advertencia(s)**.\n📋 Razón: ${razon}`)] });
  }

  if (commandName === "warns") {
    const target = options.getUser("usuario");
    const userWarns = warns.get(target.id) || [];
    if (userWarns.length === 0) return interaction.reply({ embeds: [infoEmbed("Sin advertencias", `**${target.username}** no tiene advertencias.`)] });
    const lista = userWarns.map((w, i) => `**${i + 1}.** ${w.razon} — ${w.fecha} (por ${w.moderador})`).join("\n");
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0xffaa00).setTitle(`⚠️ Advertencias de ${target.username}`).setDescription(lista).setTimestamp()] });
  }

  if (commandName === "clearwarns") {
    const target = options.getUser("usuario");
    warns.delete(target.id);
    return interaction.reply({ embeds: [successEmbed("Limpias", `Advertencias de **${target.username}** borradas.`)] });
  }

  if (commandName === "purge") {
    const cantidad = clamp(options.getInteger("cantidad"), 1, 100);
    try {
      const deleted = await interaction.channel.bulkDelete(cantidad, true);
      return interaction.reply({ embeds: [successEmbed("Purge", `Se borraron **${deleted.size}** mensajes.`)], ephemeral: true });
    } catch {
      return interaction.reply({ embeds: [errorEmbed("Error", "No pude borrar los mensajes.")], ephemeral: true });
    }
  }

  if (commandName === "lock") {
    await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
    return interaction.reply({ embeds: [successEmbed("Canal bloqueado", "🔒 Nadie puede escribir aquí.")] });
  }

  if (commandName === "unlock") {
    await interaction.channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
    return interaction.reply({ embeds: [successEmbed("Canal desbloqueado", "🔓 Canal abierto.")] });
  }

  if (commandName === "slowmode") {
    const segundos = options.getInteger("segundos");
    await interaction.channel.setRateLimitPerUser(segundos);
    return interaction.reply({ embeds: [successEmbed("Slowmode", segundos === 0 ? "Slowmode desactivado." : `Slowmode: **${segundos}s**`)] });
  }

  // ══════════════════════════════════════════
  //  UTILIDADES
  // ══════════════════════════════════════════

  if (commandName === "userinfo") {
    const target = options.getMember("usuario") || member;
    const targetUser = target.user;
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`👤 Info de ${targetUser.username}`)
          .setThumbnail(targetUser.displayAvatarURL())
          .addFields(
            { name: "ID", value: targetUser.id, inline: true },
            { name: "Cuenta creada", value: targetUser.createdAt.toLocaleDateString("es-ES"), inline: true },
            { name: "Entró al servidor", value: target.joinedAt.toLocaleDateString("es-ES"), inline: true },
            { name: "Roles", value: target.roles.cache.filter((r) => r.name !== "@everyone").map((r) => r.toString()).join(", ") || "Ninguno" }
          )
          .setTimestamp(),
      ],
    });
  }

  if (commandName === "serverinfo") {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`🏠 ${guild.name}`)
          .setThumbnail(guild.iconURL())
          .addFields(
            { name: "ID", value: guild.id, inline: true },
            { name: "Dueño", value: `<@${guild.ownerId}>`, inline: true },
            { name: "Miembros", value: `${guild.memberCount}`, inline: true },
            { name: "Canales", value: `${guild.channels.cache.size}`, inline: true },
            { name: "Roles", value: `${guild.roles.cache.size}`, inline: true },
            { name: "Creado", value: guild.createdAt.toLocaleDateString("es-ES"), inline: true }
          )
          .setTimestamp(),
      ],
    });
  }

  if (commandName === "avatar") {
    const target = options.getUser("usuario") || user;
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`🖼️ Avatar de ${target.username}`).setImage(target.displayAvatarURL({ size: 1024 }))],
    });
  }

  if (commandName === "ping") {
    return interaction.reply({ embeds: [infoEmbed("🏓 Pong!", `Latencia: **${client.ws.ping}ms**`)] });
  }

  if (commandName === "say") {
    await interaction.channel.send(options.getString("mensaje"));
    return interaction.reply({ content: "✅ Enviado.", ephemeral: true });
  }

  if (commandName === "embed") {
    const titulo = options.getString("titulo");
    const descripcion = options.getString("descripcion");
    const parsed = parseInt((options.getString("color") || "#5865f2").replace("#", ""), 16);
    const color = Number.isNaN(parsed) ? 0x5865f2 : parsed;
    await interaction.channel.send({ embeds: [new EmbedBuilder().setColor(color).setTitle(titulo).setDescription(descripcion).setTimestamp()] });
    return interaction.reply({ content: "✅ Embed enviado.", ephemeral: true });
  }

  if (commandName === "botinfo") {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("🤖 Info del Bot")
          .setThumbnail(client.user.displayAvatarURL())
          .addFields(
            { name: "Nombre", value: client.user.tag, inline: true },
            { name: "Servidores", value: `${client.guilds.cache.size}`, inline: true },
            { name: "Latencia", value: `${client.ws.ping}ms`, inline: true },
            { name: "Uptime", value: `${Math.floor(client.uptime / 60000)} minutos`, inline: true },
            { name: "Comandos", value: `${commands.length}`, inline: true }
          )
          .setTimestamp(),
      ],
    });
  }

  // ══════════════════════════════════════════
  //  ROLES (sin Scripter)
  // ══════════════════════════════════════════

  if (commandName === "roles") {
    const rolesParaCrear = [
      { nombre: "👀 Espectador", color: 0x888888 },
      { nombre: "🎮 Gamer", color: 0x00ff88 },
      { nombre: "🛡️ Helper", color: 0xffaa00 },
    ];
    await interaction.deferReply();
    for (const r of rolesParaCrear) {
      if (!guild.roles.cache.find((x) => x.name === r.nombre)) {
        await guild.roles.create({ name: r.nombre, color: r.color }).catch(() => {});
      }
    }
    const row = new ActionRowBuilder().addComponents(
      rolesParaCrear.map((r) =>
        new ButtonBuilder().setCustomId(`rol_${r.nombre}`).setLabel(r.nombre).setStyle(ButtonStyle.Primary)
      )
    );
    return interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("🏷️ Panel de Roles").setDescription("Pulsa un botón para obtener o quitar un rol:").setTimestamp()],
      components: [row],
    });
  }

  // ══════════════════════════════════════════
  //  BANSPOT (comando directo)
  // ══════════════════════════════════════════

  if (commandName === "banspot") {
    if (!isOwner(user.id, guild)) return interaction.reply({ embeds: [errorEmbed("Sin permiso", "Solo los owners pueden usar este comando.")], ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    try {
      const canal = await createBanspotChannel(guild);
      return interaction.editReply({ embeds: [successEmbed("BansPot creado", `Canal ${canal} creado y activado. ✅`)] });
    } catch (err) {
      console.error(err);
      return interaction.editReply({ embeds: [errorEmbed("Error", "Revisa mis permisos.")] });
    }
  }

  // ══════════════════════════════════════════
  //  SETTINGS — panel privado solo para owners
  // ══════════════════════════════════════════

  if (commandName === "settings") {
    if (!isOwner(user.id, guild)) return interaction.reply({ embeds: [errorEmbed("Sin permiso", "Solo los owners pueden usar `/settings`.")], ephemeral: true });
    return interaction.reply({ ...getSettingsPage("inicio"), ephemeral: true });
  }
});

// ══════════════════════════════════════════
//  INICIAR BOT
// ══════════════════════════════════════════
client.login(TOKEN);
