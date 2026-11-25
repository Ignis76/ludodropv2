import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Consolidate the shell and hardware while keeping each articulated joint independent.
export function batchRigidPart(group: THREE.Group, moving: readonly THREE.Mesh[] = []) {
  const buckets = new Map<THREE.Material, THREE.Mesh[]>();
  for (const child of group.children) {
    if (!(child instanceof THREE.Mesh) || Array.isArray(child.material) || moving.includes(child)) continue;
    const batch = buckets.get(child.material) || [];
    batch.push(child); buckets.set(child.material, batch);
  }
  for (const [material, children] of buckets) {
    if (children.length < 2) continue;
    const pieces = children.map(mesh => {
      mesh.updateMatrix();
      const part = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      part.applyMatrix4(mesh.matrix);
      return part;
    });
    const geometry = mergeGeometries(pieces, false);
    pieces.forEach(part => part.dispose());
    if (!geometry) continue;
    for (const mesh of children) {
      group.remove(mesh);
      mesh.geometry.dispose();
    }
    const combined = new THREE.Mesh(geometry, material);
    combined.castShadow = true;
    combined.receiveShadow = true;
    group.add(combined);
  }
}
