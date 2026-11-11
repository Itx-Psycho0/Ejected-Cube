import {
  AdditiveBlending,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  LatheGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  ShaderMaterial,
  SphereGeometry,
  SpotLight,
  PointLight,
  TorusGeometry,
  Vector2,
  Vector3,
  BoxGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getTextures } from '../world/textures';
import { HullPainter } from './hullPaint';
import { ACCENT_COLORS, HULL_COLORS, LIGHTS, hexOf, type Loadout } from '../game/cosmetics';
import { limb, merge } from '../world/geometry';
import type { Family } from '../themes/themes';

/**
 * EC-07 escape capsule, built from primitives with PBR materials:
 * painted hull with panel seams and wear, steel roll cage, domed viewport
 * with a pilot inside, twin floodlights with volumetric beams, thrusters,
 * ballast tanks, sonar dome, antenna beacon and navigation lights.
 * Forward is +x.
 */
export class PodModel {
  readonly root = new Group();
  /** Inner group that receives tilt / shake without moving the light rig. */
  readonly body = new Group();
  readonly spot: SpotLight;
  readonly fill: PointLight;
  readonly hullMat: MeshStandardMaterial;
  private beamMat: ShaderMaterial;
  private thrusterMat: MeshStandardMaterial;
  private beaconMat: MeshStandardMaterial;
  private shieldMat: ShaderMaterial;
  readonly shield: Mesh;
  exhaustPorts: Object3D[] = [];
  muzzle = new Object3D();
  private variants = {} as Record<Family, { group: Group; ports: Object3D[]; muzzle: Object3D }>;
  private propeller = new Group();
  kind: Family = 'water';
  private t = 0;
  private painter = new HullPainter();
  private hull!: Mesh;
  private cage: Object3D[] = [];
  private lensMat!: MeshStandardMaterial;
  private shapeId = 'rounded';

  constructor() {
    const tex = getTextures();
    this.root.add(this.body);

    this.hullMat = new MeshStandardMaterial({
      map: this.painter.map,
      roughnessMap: this.painter.rough,
      normalMap: tex.hullNormal,
      metalness: 0.45,
      roughness: 1,
      emissive: new Color(0xff2a10),
      emissiveIntensity: 0,
    });
    const steel = new MeshStandardMaterial({
      color: 0x8a9096,
      metalness: 0.9,
      roughness: 0.38,
      normalMap: tex.rustNormal,
      normalScale: new Vector2(0.3, 0.3),
    });
    const darkSteel = new MeshStandardMaterial({ color: 0x24282c, metalness: 0.8, roughness: 0.5 });
    const rubber = new MeshStandardMaterial({ color: 0x15171a, metalness: 0, roughness: 0.85 });

    // --- hull ---
    const hull = new Mesh(new RoundedBoxGeometry(16, 13, 13, 4, 2.4), this.hullMat);
    hull.castShadow = hull.receiveShadow = true;
    this.hull = hull;
    this.body.add(hull);

    // --- roll cage along the box edges ---
    const cage: ReturnType<typeof limb>[] = [];
    const hx = 8.6;
    const hy = 7.1;
    const hz = 7.1;
    const corners = [-1, 1];
    for (const sy of corners)
      for (const sz of corners) cage.push(limb(new Vector3(-hx, sy * hy, sz * hz), new Vector3(hx, sy * hy, sz * hz), 0.55, 0.55, 6));
    for (const sx of corners)
      for (const sz of corners) cage.push(limb(new Vector3(sx * hx, -hy, sz * hz), new Vector3(sx * hx, hy, sz * hz), 0.55, 0.55, 6));
    for (const sx of corners)
      for (const sy of corners) cage.push(limb(new Vector3(sx * hx, sy * hy, -hz), new Vector3(sx * hx, sy * hy, hz), 0.55, 0.55, 6));
    // Grab handles on top
    for (const x of [-4, 4]) {
      const h = new TorusGeometry(1.6, 0.28, 6, 10, Math.PI);
      h.translate(x, hy + 0.2, 0);
      cage.push(h);
    }
    const cageMesh = new Mesh(merge(cage), steel);
    cageMesh.castShadow = true;
    this.body.add(cageMesh);
    this.cage.push(cageMesh);

    // Rivets along the cage
    const rivetGeo = new SphereGeometry(0.32, 6, 4);
    const rivets = new InstancedMesh(rivetGeo, steel, 72);
    const d = new Object3D();
    let ri = 0;
    for (const sy of corners)
      for (const sz of corners)
        for (let k = 0; k < 9 && ri < 72; k++) {
          d.position.set(-hx + 1 + k * 2, sy * hy + sy * 0.45, sz * hz);
          d.updateMatrix();
          rivets.setMatrixAt(ri++, d.matrix);
        }
    rivets.count = ri;
    this.body.add(rivets);
    this.cage.push(rivets);

    // --- viewport (front, +x) ---
    const flange = new Mesh(new TorusGeometry(4.6, 0.9, 10, 28), darkSteel);
    flange.rotation.y = Math.PI / 2;
    flange.position.set(8.2, 0.8, 0);
    this.body.add(flange);
    const bolts = new InstancedMesh(new CylinderGeometry(0.35, 0.35, 0.6, 6), steel, 12);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      d.position.set(8.8, 0.8 + Math.sin(a) * 4.6, Math.cos(a) * 4.6);
      d.rotation.set(0, 0, Math.PI / 2);
      d.updateMatrix();
      bolts.setMatrixAt(i, d.matrix);
    }
    this.body.add(bolts);
    const glass = new Mesh(
      new SphereGeometry(4.2, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new MeshPhysicalMaterial({
        color: 0x9fd8ff,
        metalness: 0,
        roughness: 0.16,
        clearcoat: 1,
        clearcoatRoughness: 0.14,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    );
    glass.rotation.z = -Math.PI / 2;
    glass.position.set(8.3, 0.8, 0);
    glass.scale.set(1, 0.55, 1);
    this.body.add(glass);
    // Pilot: suit, helmet, visor, and a glowing console
    const pilot = new Group();
    const suit = new Mesh(new CapsuleGeometry(1.6, 1.8, 4, 8), new MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.8 }));
    suit.position.set(0, -1.6, 0);
    const helmet = new Mesh(new SphereGeometry(1.5, 16, 12), new MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.3, metalness: 0.1 }));
    helmet.position.set(0.2, 1, 0);
    const visor = new Mesh(
      new SphereGeometry(1.25, 16, 10, -Math.PI / 2.4, Math.PI / 1.2, Math.PI / 3, Math.PI / 3),
      new MeshStandardMaterial({ color: 0x111111, metalness: 1, roughness: 0.2, emissive: 0xffa040, emissiveIntensity: 0.25 }),
    );
    visor.position.set(0.45, 1, 0);
    pilot.add(suit, helmet, visor);
    pilot.position.set(5.6, 0.4, 0);
    this.body.add(pilot);
    const console_ = new Mesh(
      new BoxGeometry(1, 1.6, 5),
      new MeshStandardMaterial({ color: 0x0b1a22, emissive: 0x2ef2c8, emissiveIntensity: 0.9 }),
    );
    console_.position.set(7.4, -2.2, 0);
    console_.rotation.z = 0.5;
    this.body.add(console_);

    // --- floodlights under the front corners ---
    const lensMat = new MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d8, emissiveIntensity: 6, toneMapped: false });
    this.lensMat = lensMat;
    for (const z of [-5.4, 5.4]) {
      const housing = new Mesh(new CylinderGeometry(1.6, 1.9, 3.2, 14), darkSteel);
      housing.rotation.z = Math.PI / 2;
      housing.position.set(8.6, -5.6, z);
      const lens = new Mesh(new CylinderGeometry(1.35, 1.35, 0.2, 14), lensMat);
      lens.rotation.z = Math.PI / 2;
      lens.position.set(10.25, -5.6, z);
      const bracket = new Mesh(new BoxGeometry(2.4, 1.6, 0.7), darkSteel);
      bracket.position.set(7.4, -4.6, z);
      this.body.add(housing, lens, bracket);
    }
    this.spot = new SpotLight(0xfff0d8, 0, 560, 0.5, 0.65, 1.15);
    this.spot.position.set(10, -5.6, 0);
    this.spot.target.position.set(140, -40, 0);
    this.root.add(this.spot, this.spot.target);
    // Soft work light so the pod itself stays readable in the pitch-black zones.
    this.fill = new PointLight(0xbfe4ff, 260, 90, 1.6);
    this.fill.position.set(-4, 16, 26);
    this.root.add(this.fill);

    // Volumetric beam: open cone with a soft additive shader.
    this.beamMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      uniforms: { uIntensity: { value: 0.5 }, uColor: { value: new Color(0xfff0d8) }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying float vAlong; varying vec3 vN; varying vec3 vView;
        void main() {
          vAlong = uv.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uIntensity, uTime; uniform vec3 uColor;
        varying float vAlong; varying vec3 vN; varying vec3 vView;
        void main() {
          float facing = pow(abs(dot(vN, vView)), 1.8);
          float along = pow(vAlong, 2.4);
          float dust = 0.85 + 0.15 * sin(vAlong * 40.0 - uTime * 3.0);
          gl_FragColor = vec4(uColor, facing * along * uIntensity * dust * 0.17);
        }`,
    });
    const beamGeo = new ConeGeometry(52, 250, 28, 1, true);
    beamGeo.translate(0, -130, 0); // apex at origin
    const beam = new Mesh(beamGeo, this.beamMat);
    beam.rotation.z = Math.PI / 2 + 0.16;
    beam.position.set(10.2, -5.6, 0);
    beam.renderOrder = 5;
    this.root.add(beam);

    // --- rear thrusters ---
    this.thrusterMat = new MeshStandardMaterial({ color: 0x000000, emissive: 0x6ff6ff, emissiveIntensity: 3, toneMapped: false });
    const nozzleProfile = [new Vector2(1.2, 0), new Vector2(1.6, 0.6), new Vector2(2.4, 3.2), new Vector2(2.2, 3.4)];
    for (const y of [-3.2, 3.2]) {
      const nozzle = new Mesh(new LatheGeometry(nozzleProfile, 16), darkSteel);
      nozzle.material.side = DoubleSide;
      nozzle.rotation.z = Math.PI / 2;
      nozzle.position.set(-8.2, y, 0);
      const core = new Mesh(new CylinderGeometry(1.3, 1.3, 0.4, 14), this.thrusterMat);
      core.rotation.z = Math.PI / 2;
      core.position.set(-8.6, y, 0);
      const port = new Object3D();
      port.position.set(-12, y, 0);
      this.exhaustPorts.push(port);
      this.body.add(nozzle, core, port);
    }

    // --- ballast tanks on the visible flank ---
    const tankMat = new MeshStandardMaterial({ color: 0xdfe4e8, metalness: 0.6, roughness: 0.35 });
    for (const y of [-3.4, 3.4]) {
      const tank = new Mesh(new CapsuleGeometry(1.6, 9, 6, 14), tankMat);
      tank.rotation.z = Math.PI / 2;
      tank.position.set(-0.5, y, 7.9);
      const strap1 = new Mesh(new TorusGeometry(1.7, 0.25, 6, 14), darkSteel);
      strap1.position.set(-3.5, y, 7.9);
      strap1.rotation.y = Math.PI / 2;
      const strap2 = strap1.clone();
      strap2.position.x = 2.5;
      this.body.add(tank, strap1, strap2);
    }

    // --- sonar dome, antenna, beacon, nav lights ---
    const dome = new Mesh(new SphereGeometry(3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), rubber);
    dome.rotation.x = Math.PI;
    dome.position.set(-1, -6.8, 0);
    this.body.add(dome);
    const mast = new Mesh(new CylinderGeometry(0.22, 0.3, 6, 6), steel);
    mast.position.set(-5, 10, -2);
    this.body.add(mast);
    this.beaconMat = new MeshStandardMaterial({ color: 0x000000, emissive: 0xff2030, emissiveIntensity: 5, toneMapped: false });
    const beacon = new Mesh(new SphereGeometry(0.7, 10, 8), this.beaconMat);
    beacon.position.set(-5, 13.2, -2);
    this.body.add(beacon);
    const navGreen = new Mesh(
      new SphereGeometry(0.45, 8, 6),
      new MeshStandardMaterial({ color: 0x000000, emissive: 0x30ff70, emissiveIntensity: 4, toneMapped: false }),
    );
    navGreen.position.set(6, 6, 7.4);
    this.body.add(navGreen);

    // Gun under the nose
    const gun = new Mesh(new CylinderGeometry(0.6, 0.8, 7, 10), darkSteel);
    gun.rotation.z = Math.PI / 2;
    gun.position.set(6.5, -7.6, 0);
    this.body.add(gun);
    this.muzzle.position.set(11, -7.6, 0);
    this.body.add(this.muzzle);

    // --- shield bubble ---
    this.shieldMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uHit: { value: 0 }, uStrength: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vView; varying vec3 vPos;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal); vView = normalize(-mv.xyz); vPos = position;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uHit, uStrength;
        varying vec3 vN; varying vec3 vView; varying vec3 vPos;
        void main() {
          float fres = pow(1.0 - abs(dot(vN, vView)), 2.5);
          float hex = 0.5 + 0.5 * sin(vPos.x * 1.4 + uTime * 2.0) * sin(vPos.y * 1.4 - uTime * 1.3) * sin(vPos.z * 1.4);
          vec3 c = mix(vec3(0.18, 0.95, 0.78), vec3(1.0), uHit);
          gl_FragColor = vec4(c, (fres * (0.7 + hex * 0.5) + uHit * 0.3) * uStrength);
        }`,
    });
    this.shield = new Mesh(new SphereGeometry(15, 32, 20), this.shieldMat);
    this.shield.visible = false;
    this.root.add(this.shield);

    this.buildVariants(steel, darkSteel);
    this.root.scale.setScalar(1.35);
    this.root.traverse((o) => {
      if ((o as Mesh).isMesh && o !== this.shield) o.castShadow = true;
    });
  }

  /**
   * The capsule built above becomes the 'water' craft. Sky worlds get a
   * propeller fighter and space worlds a starship; all three share the
   * painted hull material, so hangar colours and patterns carry over.
   */
  private buildVariants(steel: MeshStandardMaterial, dark: MeshStandardMaterial) {
    const sub = new Group();
    for (const c of [...this.body.children]) sub.add(c);
    this.body.add(sub);
    this.variants.water = { group: sub, ports: this.exhaustPorts, muzzle: this.muzzle };

    const glassMat = new MeshPhysicalMaterial({ color: 0x9fd8ff, roughness: 0.16, clearcoat: 1, transparent: true, opacity: 0.45, depthWrite: false });
    const port = (g: Group, x: number, y: number, z: number) => {
      const o = new Object3D();
      o.position.set(x, y, z);
      g.add(o);
      return o;
    };
    const pilot = () => {
      const g = new Group();
      const head = new Mesh(new SphereGeometry(1.5, 14, 10), new MeshStandardMaterial({ color: 0x7a4a2a, roughness: 0.6 }));
      const goggles = new Mesh(new BoxGeometry(1, 0.9, 2.4), new MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.2 }));
      goggles.position.set(1.1, 0.3, 0);
      const scarf = new Mesh(new BoxGeometry(3.4, 0.7, 1), new MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.9 }));
      scarf.position.set(-2, -1.2, 0);
      g.add(head, goggles, scarf);
      return g;
    };

    // ---------- propeller fighter ----------
    const plane = new Group();
    const fusePts: Vector2[] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      fusePts.push(new Vector2(0.4 + Math.sin(Math.min(1, t * 1.5) * Math.PI * 0.5) * 4.6 * (1 - Math.max(0, t - 0.75) * 1.2), 11 - t * 25));
    }
    const fuse = new Mesh(new LatheGeometry(fusePts, 18), this.hullMat);
    fuse.rotation.z = -Math.PI / 2;
    const cowl = new Mesh(new CylinderGeometry(4.5, 4.7, 3.4, 18), dark);
    cowl.rotation.z = Math.PI / 2;
    cowl.position.x = 10.2;
    const spinner = new Mesh(new ConeGeometry(1.8, 3.6, 14), steel);
    spinner.rotation.z = -Math.PI / 2;
    this.propeller.add(spinner);
    for (const a of [0, Math.PI / 2]) {
      const blade = new Mesh(new BoxGeometry(0.5, 17, 1.7), dark);
      blade.rotation.x = a;
      this.propeller.add(blade);
    }
    this.propeller.position.x = 13.4;
    const wingGeo = new BoxGeometry(7.5, 0.8, 38);
    const wing = new Mesh(wingGeo, this.hullMat);
    wing.position.set(1.5, -1.6, 0);
    const tips = new Mesh(new BoxGeometry(7.6, 0.9, 3), dark);
    const tipL = tips.clone();
    tips.position.set(1.5, -1.6, 18);
    tipL.position.set(1.5, -1.6, -18);
    const stab = new Mesh(new BoxGeometry(4.6, 0.6, 14), this.hullMat);
    stab.position.set(-12.4, 0.6, 0);
    const fin = new Mesh(new BoxGeometry(5, 6.6, 0.7), this.hullMat);
    fin.position.set(-12.2, 3.6, 0);
    fin.rotation.z = -0.25;
    const canopy = new Mesh(new SphereGeometry(3.3, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), glassMat);
    canopy.scale.set(1.5, 1, 0.85);
    canopy.position.set(0.5, 3.4, 0);
    const pl = pilot();
    pl.position.set(0.6, 4.4, 0);
    const gear: Mesh[] = [];
    for (const z of [-5, 5]) {
      const strut = new Mesh(new CylinderGeometry(0.3, 0.3, 4, 6), steel);
      strut.position.set(3.5, -4, z);
      const wheel = new Mesh(new CylinderGeometry(1.6, 1.6, 1, 14), dark);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(3.5, -6, z);
      gear.push(strut, wheel);
    }
    const guns: Mesh[] = [];
    for (const z of [-8, 8]) {
      const gun = new Mesh(new CylinderGeometry(0.35, 0.35, 5, 8), dark);
      gun.rotation.z = Math.PI / 2;
      gun.position.set(6, -1.4, z);
      guns.push(gun);
    }
    plane.add(fuse, cowl, this.propeller, wing, tips, tipL, stab, fin, canopy, pl, ...gear, ...guns);
    this.variants.sky = { group: plane, ports: [port(plane, -15, 0.5, 0), port(plane, -15, 0.5, 0)], muzzle: port(plane, 12, -2.4, 0) };

    // ---------- starship ----------
    const ship = new Group();
    const hullPts: Vector2[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      hullPts.push(new Vector2(0.2 + Math.pow(t, 0.7) * 4.6, 15 - t * 26));
    }
    const hull = new Mesh(new LatheGeometry(hullPts, 16), this.hullMat);
    hull.rotation.z = -Math.PI / 2;
    hull.scale.set(1, 1, 1.25);
    const wingShape = new ConeGeometry(11, 20, 3, 1);
    wingShape.rotateZ(-Math.PI / 2);
    wingShape.scale(1, 0.09, 1);
    for (const z of [-1, 1]) {
      const w = new Mesh(wingShape, this.hullMat);
      w.position.set(-6, -0.6, z * 9);
      w.rotation.y = z * 0.5;
      w.rotation.x = z * -0.12;
      const tipFin = new Mesh(new BoxGeometry(7, 5, 0.6), dark);
      tipFin.position.set(-11, 1.2, z * 15.5);
      const engine = new Mesh(new CylinderGeometry(2, 2.5, 8, 14), dark);
      engine.rotation.z = Math.PI / 2;
      engine.position.set(-10.5, 0, z * 5);
      const glow = new Mesh(new CylinderGeometry(1.7, 1.7, 0.4, 14), this.thrusterMat);
      glow.rotation.z = Math.PI / 2;
      glow.position.set(-14.6, 0, z * 5);
      ship.add(w, tipFin, engine, glow);
    }
    const dome = new Mesh(new SphereGeometry(3, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), glassMat);
    dome.scale.set(2, 0.9, 0.9);
    dome.position.set(1.5, 2.6, 0);
    const spine = new Mesh(new BoxGeometry(12, 1, 1.4), dark);
    spine.position.set(-6, 3.4, 0);
    const cannon = new Mesh(new CylinderGeometry(0.5, 0.7, 8, 10), steel);
    cannon.rotation.z = Math.PI / 2;
    cannon.position.set(8, -3, 0);
    hull.scale.set(1, 1.5, 1.25);
    const tail = new Mesh(new BoxGeometry(9, 9, 0.8), this.hullMat);
    tail.position.set(-9, 6, 0);
    tail.rotation.z = -0.5;
    const belly = new Mesh(new BoxGeometry(14, 2.4, 5), dark);
    belly.position.set(-3, -5.4, 0);
    const stripe = new Mesh(new BoxGeometry(16, 0.8, 9.6), this.thrusterMat);
    stripe.position.set(-4, 0.4, 0);
    ship.add(hull, dome, spine, cannon, tail, belly, stripe);
    this.variants.space = { group: ship, ports: [port(ship, -17, 0, 5), port(ship, -17, 0, -5)], muzzle: port(ship, 13, -3, 0) };

    plane.visible = ship.visible = false;
    this.body.add(plane, ship);
  }

  /** Swap the craft for the current world's family. */
  setKind(kind: Family) {
    this.kind = kind;
    for (const k of Object.keys(this.variants) as Family[]) this.variants[k].group.visible = k === kind;
    this.exhaustPorts = this.variants[kind].ports;
    this.muzzle = this.variants[kind].muzzle;
    this.shield.scale.setScalar(kind === 'water' ? 1 : 1.25);
  }

  /** Apply hangar choices: paint, shape, light colour and roll cage. */
  applyLoadout(l: Loadout) {
    this.painter.paint({ color: hexOf(HULL_COLORS, l.color), accent: hexOf(ACCENT_COLORS, l.accent), pattern: l.pattern, callsign: l.callsign || 'EC-07' });
    if (l.shape !== this.shapeId) {
      this.shapeId = l.shape;
      const r = l.shape === 'sharp' ? 0.4 : l.shape === 'soft' ? 5.6 : 2.4;
      this.hull.geometry.dispose();
      this.hull.geometry = new RoundedBoxGeometry(16, 13, 13, l.shape === 'soft' ? 6 : 4, r);
    }
    const light = new Color(hexOf(LIGHTS, l.light));
    this.spot.color.copy(light);
    this.beamMat.uniforms.uColor.value.copy(light);
    this.lensMat.emissive.copy(light);
    for (const c of this.cage) c.visible = l.cage;
  }

  /** Called every frame with visual state from the Player. */
  animate(dt: number, opts: { thrust: number; hitFlash: number; beam: number; shieldHit: number; shieldOn: boolean; dashing: boolean }) {
    this.t += dt;
    this.propeller.rotation.x += dt * (26 + opts.thrust * 30);
    this.thrusterMat.emissiveIntensity = 2 + opts.thrust * 4 + (opts.dashing ? 8 : 0) + Math.sin(this.t * 40) * 0.4;
    this.beaconMat.emissiveIntensity = Math.sin(this.t * 4) > 0.6 ? 7 : 0.2;
    this.hullMat.emissiveIntensity = opts.hitFlash * 1.6;
    this.beamMat.uniforms.uIntensity.value = opts.beam;
    this.beamMat.uniforms.uTime.value = this.t;
    this.spot.intensity = 900 + opts.beam * 2600;
    this.shield.visible = opts.shieldOn || opts.shieldHit > 0.01;
    this.shieldMat.uniforms.uTime.value = this.t;
    this.shieldMat.uniforms.uHit.value = opts.shieldHit;
    this.shield.scale.setScalar(1 + opts.shieldHit * 0.12);
  }
}
