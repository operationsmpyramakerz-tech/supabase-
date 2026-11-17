// Enrich only the project rows already visible in an authorized event detail.
// Legacy project rows have a title but no component ID; ambiguous titles must
// not be matched to an arbitrary catalogue entry.
const text = value => String(value ?? "").trim();
const nameKey = value => text(value).replace(/\s+/g, " ").toLowerCase();

export function attachProjectResources(projects, components) {
  const byId = new Map();
  const byName = new Map();
  for (const resource of Array.isArray(components) ? components : []) {
    if (resource?.category !== "project") continue;
    const id = text(resource.id);
    const name = nameKey(resource.name);
    if (id) byId.set(id, resource);
    if (name) byName.set(name, byName.has(name) ? null : resource);
  }
  return (Array.isArray(projects) ? projects : []).map(project => {
    const id = text(project?.componentId);
    const resource = id ? byId.get(id) : byName.get(nameKey(project?.title));
    if (!resource) return project;
    return { ...project, resource: {
      photoUrl: text(resource.photoUrl),
      description: text(resource.description),
      ownershipType: resource.ownershipType === "external_rental" ? "external_rental" : "company_owned",
      isActive: resource.isActive !== false,
    }};
  });
}
