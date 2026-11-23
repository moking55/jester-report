// The contract's TemplateId pattern, in a module the browser may import (lib/result is server-only).
const TEMPLATE_ID = /^[a-z0-9][a-z0-9-]{1,62}$/;

export const isTemplateId = (id: string) => TEMPLATE_ID.test(id);
