// src/utils/breadcrumbs.js
const prisma = require("../db/prisma");

/**
 * Returns [{id, name}] from root -> current folder.
 */
async function buildBreadcrumbs(folderId, userId) {
  const crumbs = [];
  let cur = await prisma.folder.findFirst({
    where: { id: folderId, userId },
    select: { id: true, name: true, parentId: true },
  });
  if (!cur) return [];
  while (cur) {
    crumbs.push({ id: cur.id, name: cur.name });
    if (!cur.parentId) break;
    cur = await prisma.folder.findFirst({
      where: { id: cur.parentId, userId },
      select: { id: true, name: true, parentId: true },
    });
  }
  return crumbs.reverse();
}

module.exports = { buildBreadcrumbs };
