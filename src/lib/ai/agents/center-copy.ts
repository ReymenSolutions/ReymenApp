import type { Lang } from "@/lib/i18n";
const copy = {
  es: {
    title: "Centro de asistentes IA", intro: "Tu asistente, la información que consulta y los canales donde atiende a tus clientes.",
    overview: "Resumen", agents: "Mis asistentes", channels: "Canales", knowledge: "Conocimiento", test: "Probar", usage: "Uso y resultados",
    assistant: "Tu asistente", existing: "Asistente actual", profile: "Perfil del asistente", configure: "Configurar", view: "Ver asistente", activity: "Actividad", allActivity: "Ver conversaciones",
    distinction: "El asistente es quien ayuda a responder. Los canales son por dónde escribe el cliente. Su información e historial siguen en el CRM.",
    total: "Conversaciones", open: "Abiertas", human: "Esperan a tu equipo", period: "Todos los canales · historial completo. Los pendientes muestran el estado actual.",
    recent: "Conversaciones recientes", noConversations: "Aún no hay conversaciones", start: "Revisa los canales y prepara la información de tu negocio para comenzar.",
    modes: "Cómo responde", off: "Apagado", suggest: "Sugiere respuestas", auto: "Responde automáticamente", shared: "Usa las mismas reglas del negocio en todos los canales.",
    help: "Cuándo te pide ayuda", helpText: "Si la respuesta no está cubierta, el cliente pide a una persona o falla la IA, el equipo puede continuar desde la conversación.",
    abilities: "Qué puede hacer", abilitiesText: "Redactar respuestas con las reglas y artículos actuales. El modo de cada canal determina si una persona revisa la respuesta antes de enviarla.",
    connection: "Conexión sin verificar", received: "Último mensaje recibido", noActivity: "Sin actividad recibida", connectionNote: "Recibir un mensaje no confirma que la conexión siga disponible ni que una respuesta haya sido entregada.",
    channelIntro: "Elige cómo se atiende en cada canal. Cambiar el modo no conecta una cuenta ni verifica su conexión.",
    enquiryNote: "Consultas enviadas desde formularios. La respuesta depende de los datos de contacto que incluya cada consulta.",
    number: "Número registrado de WhatsApp", numberNote: "Conserva el número configurado actualmente. Guardarlo aquí no conecta ni verifica una cuenta.",
    name: "Nombre que verá tu cliente", save: "Guardar nombre", saved: "Nombre guardado", readOnly: "Puedes consultar esta información. Solo quien administra el asistente puede cambiarla.",
    refresh: "Recargar datos", saveError: "No se pudo guardar. Conservamos lo que escribiste.",
    history: "Historial del asistente", noExecutions: "Todavía no hay actividad registrada del asistente", historyHint: "El historial de tus clientes sigue en el CRM. Aquí aparecen las tareas del asistente que cuentan con seguimiento.",
    details: "Ver detalle", close: "Cerrar", revision: "Versión de configuración", observation: "Configuración observada al recibir el mensaje; no garantiza reproducir la respuesta exacta.",
    previous: "Anterior", next: "Siguiente", search: "Buscar artículos", category: "Categoría", all: "Todas", searchButton: "Buscar", noArticles: "No hay artículos para esta búsqueda", clear: "Limpiar filtros",
    articlesHint: "Información compartida del negocio. El asistente utiliza hasta 8 artículos activos recientes, con un máximo de 1,200 caracteres por artículo. Mantén breve la información esencial.",
    content: "Ver contenido", updated: "Actualizado", active: "Activo", inactive: "Inactivo", noPermission: "Tu perfil no permite consultar las conversaciones.",
    error: "No pudimos cargar esta sección", retry: "Reintentar", errorHelp: "Intenta de nuevo. Tus datos y cambios guardados se conservan.", loading: "Cargando la sección…", retryTrace: "No se pudo cargar el detalle. Intenta de nuevo.",
    deliveredNote: "Un registro de envío no confirma que el cliente lo haya leído.",
  },
  en: {
    title: "AI Assistant Center", intro: "Your assistant, the information it uses and the channels where it helps your customers.",
    overview: "Overview", agents: "My assistants", channels: "Channels", knowledge: "Knowledge", test: "Test", usage: "Usage & results",
    assistant: "Your assistant", existing: "Current assistant", profile: "Assistant profile", configure: "Configure", view: "View assistant", activity: "Activity", allActivity: "View conversations",
    distinction: "The assistant helps reply. Channels are where customers write. Their information and history remain in the CRM.",
    total: "Conversations", open: "Open", human: "Waiting for your team", period: "All channels · complete history. Pending counts show current status.",
    recent: "Recent conversations", noConversations: "No conversations yet", start: "Review your channels and prepare your business information to get started.",
    modes: "How it replies", off: "Off", suggest: "Suggests replies", auto: "Replies automatically", shared: "Uses the same business rules on every channel.",
    help: "When it asks for help", helpText: "If the answer is not covered, the customer asks for a person or AI fails, your team can continue from the conversation.",
    abilities: "What it can do", abilitiesText: "Draft replies using current rules and articles. Each channel's mode determines whether a person reviews a reply before sending.",
    connection: "Connection not verified", received: "Last message received", noActivity: "No received activity", connectionNote: "Receiving a message does not confirm the connection is still available or that a reply was delivered.",
    channelIntro: "Choose how customers are helped on each channel. Changing the mode does not connect an account or verify its connection.",
    enquiryNote: "Enquiries sent through forms. Replies depend on the contact information included in each enquiry.",
    number: "Registered WhatsApp number", numberNote: "Keeps the number currently configured. Saving it here does not connect or verify an account.",
    name: "Name your customer will see", save: "Save name", saved: "Name saved", readOnly: "You can view this information. Only people who manage the assistant can change it.",
    refresh: "Reload data", saveError: "Could not save. We kept what you typed.",
    history: "Assistant activity history", noExecutions: "No recorded assistant activity yet", historyHint: "Your customer history remains in the CRM. Assistant tasks with recorded tracking appear here.",
    details: "View details", close: "Close", revision: "Configuration version", observation: "Configuration observed when the message was received; it does not guarantee exact reply reproduction.",
    previous: "Previous", next: "Next", search: "Search articles", category: "Category", all: "All", searchButton: "Search", noArticles: "No articles match your search", clear: "Clear filters",
    articlesHint: "Shared business information. The assistant uses up to 8 recently updated active articles, with at most 1,200 characters per article. Keep essential information concise.",
    content: "View content", updated: "Updated", active: "Active", inactive: "Inactive", noPermission: "Your role cannot view conversations.",
    error: "We could not load this section", retry: "Try again", errorHelp: "Please try again. Your data and saved changes are preserved.", loading: "Loading section…", retryTrace: "Could not load details. Try again.",
    deliveredNote: "A send record does not confirm that the customer read the message.",
  },
};
export const aiCenterCopy = (lang: Lang) => copy[lang];
export const channelLabel = (channel: string, lang: Lang) => ({ whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger", webchat: lang === "es" ? "Chat del sitio web" : "Website chat", email: lang === "es" ? "Correo" : "Email", enquiry: lang === "es" ? "Consultas de formularios" : "Form enquiries" }[channel] ?? channel);
export const executionLabel = (status: string, lang: Lang): string => {
  const labels: Record<string, [string, string]> = { QUEUED: ["En espera", "Queued"], RUNNING: ["En proceso", "In progress"], WAITING_HANDOFF: ["Requiere una persona", "Needs a person"], SUCCEEDED: ["Finalizada", "Completed"], FAILED: ["No se pudo completar", "Could not complete"], CANCELLED: ["No se ejecutó", "Not executed"], admission: ["Mensaje recibido", "Message received"], generation: ["Preparación de respuesta", "Reply preparation"], dispatch: ["Solicitud de envío", "Send request"], analysis: ["Análisis del CRM", "CRM analysis"] };
  return labels[status]?.[lang === "es" ? 0 : 1] ?? (lang === "es" ? "Requiere revisión" : "Needs review");
};
