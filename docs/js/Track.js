class Boundary {
    constructor(x1, y1, x2, y2, type = "wall") {
        // Sécurité contre les valeurs invalides
        if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) {
            x1 = x2 = y1 = y2 = 0;
        }
        this.a = createVector(x1, y1);
        this.b = createVector(x2, y2);
        this.type = type;
        this.segmentIndex = 0;
    }

    show() {
        // Les murs de collision sont peints dans le décor mis en cache (vibreurs rouge et blanc) :
        // on ne les retrace en direct que pour le debug, afin de voir la vraie géométrie.
        if (this.type === "wall") {
            if (!showDebugSensors) return;
            stroke(90, 230, 255, 160);
            strokeWeight(1);
        } else if (this.type === "checkpoint") {
            stroke(80, 240, 160, 90);
            strokeWeight(1);
        }
        line(this.a.x, this.a.y, this.b.x, this.b.y);
        strokeWeight(1);
    }
}


/**
 * Vérifie si deux segments [p1, p2] et [p3, p4] se croisent.
 */
function doSegmentsIntersect(p1, p2, p3, p4) {
    const ccw = (a, b, c) => (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0]);
    return (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4));
}

/**
 * Cherche une auto-intersection dans une boucle FERMÉE (le dernier point rejoint le premier).
 * Retourne [i, j] (indices des deux segments qui se croisent) ou null si la boucle est simple.
 * Les segments voisins (qui partagent un sommet) sont ignorés.
 */
function findLoopSelfIntersection(points) {
    const count = points.length;
    if (count < 4) return null;
    for (let i = 0; i < count; i++) {
        const a = points[i];
        const b = points[(i + 1) % count];
        for (let j = i + 2; j < count; j++) {
            if (i === 0 && j === count - 1) continue; // segments voisins via la fermeture
            if (doSegmentsIntersect(a, b, points[j], points[(j + 1) % count])) return [i, j];
        }
    }
    return null;
}

// Point d'intersection de deux segments (ou null s'ils ne se croisent pas).
function segmentIntersectionPoint(p1, p2, p3, p4) {
    const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
    if (Math.abs(d) < 1e-9) return null;
    const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
    const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
}

/**
 * Ferme proprement une boucle dessinée à la main. Quand le trait dépasse un peu son point de
 * départ (ou que le dernier segment de fermeture recoupe le début), le tracé se croise une seule
 * fois près de la jonction : on coupe ce petit bout en trop et on referme sur le point de
 * croisement. Un vrai croisement au milieu du circuit (boucle en « 8 ») n'est PAS corrigé :
 * la fonction renvoie alors le tracé tel quel et la validation le refusera.
 */
function closeDraftLoop(points) {
    const crossing = findLoopSelfIntersection(points);
    if (!crossing) return points;
    const count = points.length;
    const [i, j] = crossing;
    const discarded = (i + 1) + (count - 1 - j);
    if (discarded > Math.max(8, count * 0.25)) return points;
    const hit = segmentIntersectionPoint(points[i], points[(i + 1) % count], points[j], points[(j + 1) % count]);
    if (!hit) return points;
    const trimmed = [hit, ...points.slice(i + 1, j + 1)];
    return findLoopSelfIntersection(trimmed) ? points : trimmed;
}

function interpolatePoints(points, resolution = 10) {
    let newPoints = [];
    const n = points.length;

    for (let i = 0; i < n; i++) {
        // On interpole entre p1 et p2
        let p0 = points[(i - 1 + n) % n];
        let p1 = points[i];
        let p2 = points[(i + 1) % n];
        let p3 = points[(i + 2) % n];

        for (let t = 0; t < 1; t += 1 / resolution) {
            let t2 = t * t;
            let t3 = t2 * t;

            let x = 0.5 * (
                (2 * p1[0]) +
                (-p0[0] + p2[0]) * t +
                (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
                (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
            );
            let y = 0.5 * (
                (2 * p1[1]) +
                (-p0[1] + p2[1]) * t +
                (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
                (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
            );
            newPoints.push([x, y]);
        }
    }
    return newPoints;
}

// Ré-échantillonnage pour une densité de points parfaitement uniforme et un bouclage parfait
function resamplePoints(points, spacing = 8) {
    let resampled = [];
    let totalDist = 0;
    const n = points.length;

    let segmentDistances = [];
    for (let i = 0; i < n; i++) {
        let d = dist(points[i][0], points[i][1], points[(i + 1) % n][0], points[(i + 1) % n][1]);
        segmentDistances.push(d);
        totalDist += d;
    }

    // On veut un nombre entier de segments pour boucler parfaitement
    let numSegments = Math.round(totalDist / spacing);
    let actualSpacing = totalDist / numSegments;

    let accumulatedDist = 0;
    let currentSegment = 0;

    for (let i = 0; i < numSegments; i++) {
        let targetDist = i * actualSpacing;

        while (accumulatedDist + segmentDistances[currentSegment] < targetDist && currentSegment < n - 1) {
            accumulatedDist += segmentDistances[currentSegment];
            currentSegment++;
        }

        let t = (targetDist - accumulatedDist) / segmentDistances[currentSegment];
        let p1 = points[currentSegment];
        let p2 = points[(currentSegment + 1) % n];

        resampled.push([
            lerp(p1[0], p2[0], t),
            lerp(p1[1], p2[1], t)
        ]);
    }

    return resampled;
}

// Circuit sur lequel l'entraînement tourne en ce moment : le circuit choisi, ou, en mode
// multi-circuits, celui du tour courant de la génération.
function trainingPreset() {
    if (MULTI_TRACK_TRAINING && MULTI_TRACK_SET.length) {
        return MULTI_TRACK_SET[multiTrackRound % MULTI_TRACK_SET.length];
    }
    return TRACK_PRESET;
}

// Construit le circuit `preset` (par défaut : celui de l'entraînement). Le paramètre permet
// de dessiner un autre circuit (course de vérification, tour suivant) sans toucher au réglage
// TRACK_PRESET choisi par l'utilisateur.
function setupTrack(preset = trainingPreset()) {
    walls = [];
    checkpoints = [];
    currentTrackPreset = preset;

    let centerPoints;
    if (preset === "custom" && customTrackPath.length >= 8) {
        const smoothedCustomPath = interpolatePoints(customTrackPath, 2);
        centerPoints = resamplePoints(smoothedCustomPath, 14);
    } else {
        const sampleCount = 48;
        const shortSide = Math.min(width, height);
        const radiusX = Math.max(TRACK_WIDTH * 0.85, Math.min(width * 0.37, shortSide * 0.43));
        const radiusY = Math.max(TRACK_WIDTH * 0.85, Math.min(height * 0.34, shortSide * 0.39));
        const difficulty = constrain(TRACK_DIFFICULTY / 50, 0, 1);
        const points = [];

        for (let i = 0; i < sampleCount; i++) {
            const angle = (Math.PI * 2 * i) / sampleCount;
            let wave = 0;
            if (preset === "easy") {
                wave = difficulty * 0.035 * Math.cos(2 * angle);
            } else if (preset === "medium") {
                wave = (0.08 + difficulty * 0.08) * Math.cos(3 * angle);
            } else if (preset === "technical") {
                wave = (0.15 + difficulty * 0.12) * Math.cos(5 * angle) +
                    (0.04 + difficulty * 0.04) * Math.sin(3 * angle);
            }
            const radius = 1 + wave;
            points.push([
                width / 2 + Math.cos(angle) * radiusX * radius,
                height / 2 + Math.sin(angle) * radiusY * radius
            ]);
        }

        centerPoints = resamplePoints(interpolatePoints(points, 5), 14);
    }

    if (centerPoints.length < 8) {
        if (preset === TRACK_PRESET) TRACK_PRESET = "easy";
        return setupTrack("easy");
    }

    const innerPoints = [], outerPoints = [];

    for (let i = 0; i < centerPoints.length; i++) {
        const previous = centerPoints[(i - 2 + centerPoints.length) % centerPoints.length];
        const next = centerPoints[(i + 2) % centerPoints.length];
        const tangent = createVector(next[0] - previous[0], next[1] - previous[1]).normalize();
        const normal = createVector(-tangent.y, tangent.x);
        const point = centerPoints[i];
        const halfWidth = TRACK_WIDTH / 2;

        innerPoints.push([point[0] + normal.x * halfWidth, point[1] + normal.y * halfWidth]);
        outerPoints.push([point[0] - normal.x * halfWidth, point[1] - normal.y * halfWidth]);
    }

    const allBounds = [...innerPoints, ...outerPoints];
    const minX = Math.min(...allBounds.map(point => point[0]));
    const maxX = Math.max(...allBounds.map(point => point[0]));
    const minY = Math.min(...allBounds.map(point => point[1]));
    const maxY = Math.max(...allBounds.map(point => point[1]));
    const margin = Math.max(36, TRACK_WIDTH / 2 + 12);
    const scale = Math.min(
        1,
        (width - margin * 2) / Math.max(1, maxX - minX),
        (height - margin * 2) / Math.max(1, maxY - minY)
    );
    const centerBoundsX = (minX + maxX) / 2;
    const centerBoundsY = (minY + maxY) / 2;
    const transform = pointsToTransform => pointsToTransform.forEach(point => {
        point[0] = (point[0] - centerBoundsX) * scale + width / 2;
        point[1] = (point[1] - centerBoundsY) * scale + height / 2;
    });
    transform(innerPoints);
    transform(outerPoints);
    transform(centerPoints);
    currentTrackPath = centerPoints;
    if (preset === "custom") {
        customTrackPath = centerPoints.map(point => [...point]);
    }
    TRACK_LENGTH = centerPoints.reduce((length, point, index, points) => {
        const next = points[(index + 1) % points.length];
        return length + dist(point[0], point[1], next[0], next[1]);
    }, 0);
    currentInnerBoundary = innerPoints;
    currentOuterBoundary = outerPoints;
    currentLandscaping = createLandscaping(innerPoints);
    currentScenery = createOuterScenery();
    trackLayer = null; // le décor fixe sera repeint une fois, au prochain affichage

    const cpStep = 4;
    for (let i = 0; i < innerPoints.length; i++) {
        const pi1 = innerPoints[i], pi2 = innerPoints[(i + 1) % innerPoints.length];
        const po1 = outerPoints[i], po2 = outerPoints[(i + 1) % outerPoints.length];
        const innerWall = new Boundary(pi1[0], pi1[1], pi2[0], pi2[1], "wall");
        const outerWall = new Boundary(po1[0], po1[1], po2[0], po2[1], "wall");
        innerWall.segmentIndex = i;
        outerWall.segmentIndex = i;
        walls.push(innerWall, outerWall);

        if (i % cpStep === 0) {
            checkpoints.push(new Boundary(innerPoints[i][0], innerPoints[i][1], outerPoints[i][0], outerPoints[i][1], "checkpoint"));
        }
    }

    const startIdx = floor(centerPoints.length * 0.05);
    startX = centerPoints[startIdx][0];
    startY = centerPoints[startIdx][1];
    const nextIdx = (startIdx + 10) % centerPoints.length;
    window.startAngle = Math.atan2(
        centerPoints[nextIdx][1] - startY,
        centerPoints[nextIdx][0] - startX
    );
    window.startCheckpointIndex = (Math.floor(startIdx / cpStep) + 1) % checkpoints.length;
}

// ---------------------------------------------------------------------------------------------
// RENDU DU CIRCUIT
// Tout ce qui est fixe (herbe, décor, asphalte, vibreurs, ligne d'arrivée) est peint UNE fois dans
// un calque p5.Graphics (trackLayer), puis simplement recopié à chaque image : le rendu est bien
// plus riche sans coûter de calcul à chaque frame. Le calque est invalidé par setupTrack().
// ---------------------------------------------------------------------------------------------

// Bruit déterministe (pas de hasard : le même circuit donne toujours le même décor).
function sceneryNoise(a, b = 0, c = 0) {
    const value = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
    return value - Math.floor(value);
}

// Distance minimale d'un point à la ligne centrale du circuit.
function distanceToCenterline(x, y, path = currentTrackPath) {
    let best = Infinity;
    for (let i = 0; i < path.length; i++) {
        const dx = path[i][0] - x;
        const dy = path[i][1] - y;
        const d = dx * dx + dy * dy;
        if (d < best) best = d;
    }
    return Math.sqrt(best);
}

// Décor EXTÉRIEUR : arbres, buissons, rochers, fleurs, posés hors de la piste (et de sa zone de
// dégagement). Les arbres de l'infield restent dans currentLandscaping.
function createOuterScenery() {
    const items = [];
    if (!currentTrackPath.length) return items;
    const clearance = TRACK_WIDTH / 2 + 34;
    const step = 46;
    for (let gx = 0, ix = 0; gx < width; gx += step, ix++) {
        for (let gy = 0, iy = 0; gy < height; gy += step, iy++) {
            const x = gx + (sceneryNoise(ix, iy, 1) - 0.5) * step * 0.9;
            const y = gy + (sceneryNoise(ix, iy, 2) - 0.5) * step * 0.9;
            if (x < 6 || y < 6 || x > width - 6 || y > height - 6) continue;
            if (isInsidePolygon(x, y, currentInnerBoundary)) continue;
            if (distanceToCenterline(x, y) < clearance) continue;
            const roll = sceneryNoise(ix, iy, 3);
            const size = 14 + sceneryNoise(ix, iy, 4) * 14;
            let kind;
            if (roll < 0.42) kind = "tree";
            else if (roll < 0.62) kind = "pine";
            else if (roll < 0.80) kind = "bush";
            else if (roll < 0.90) kind = "rock";
            else kind = "flowers";
            items.push({ kind, x, y, size, tone: sceneryNoise(ix, iy, 5) });
        }
    }
    // Les plus "hauts" (y) sont peints en dernier : les arbres du bas masquent ceux du haut.
    items.sort((a, b) => a.y - b.y);
    return items;
}

// Arbres de l'infield (à l'intérieur de la boucle), à l'écart de la piste.
function createLandscaping(boundary) {
    const decorations = [];
    const clearance = TRACK_WIDTH / 2 + 30;
    for (let x = 60; x < width; x += 92) {
        for (let y = 60; y < height; y += 92) {
            if (!isInsidePolygon(x, y, boundary)) continue;
            const treeX = x + ((x + y) % 23);
            const treeY = y + ((x * 2 + y) % 19);
            if (!isInsidePolygon(treeX, treeY, boundary)) continue;
            if (distanceToCenterline(treeX, treeY) < clearance) continue;
            decorations.push({
                x: treeX,
                y: treeY,
                size: 12 + ((x + y) % 7)
            });
        }
    }
    return decorations;
}

function isInsidePolygon(x, y, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        const crossesEdge = (yi > y) !== (yj > y) &&
            x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (crossesEdge) inside = !inside;
    }
    return inside;
}

// Affichage : recopie le calque fixe (créé à la demande). Sans createGraphics (tests, ancien
// navigateur), on peint directement sur le canvas principal.
function drawTrackSurface() {
    if (typeof createGraphics !== "function") {
        paintTrackScene(globalThis);
        return;
    }
    if (!trackLayer || trackLayer.width !== width || trackLayer.height !== height) {
        trackLayer = createGraphics(width, height);
        paintTrackScene(trackLayer);
    }
    image(trackLayer, 0, 0);
}

function paintTrackScene(g) {
    paintGrass(g);
    paintInfield(g);
    paintOuterScenery(g, false);
    if (currentTrackPath.length >= 2) {
        paintRoad(g);
        paintKerbs(g);
        paintStartFinish(g);
    }
    paintOuterScenery(g, true);
    paintVignette(g);
}

function paintGrass(g) {
    g.noStroke();
    g.background(54, 128, 74);
    // Bandes de tonte en diagonale
    g.push();
    g.translate(width / 2, height / 2);
    g.rotate(-Math.PI / 7);
    const reach = Math.hypot(width, height);
    for (let x = -reach, i = 0; x < reach; x += 56, i++) {
        g.fill(i % 2 === 0 ? g.color(70, 148, 86, 55) : g.color(36, 104, 62, 50));
        g.rect(x, -reach, 56, reach * 2);
    }
    g.pop();
    // Taches de couleur douces, puis brins d'herbe
    for (let i = 0; i < 70; i++) {
        const x = sceneryNoise(i, 1, 9) * width;
        const y = sceneryNoise(i, 2, 9) * height;
        const r = 60 + sceneryNoise(i, 3, 9) * 120;
        g.fill(sceneryNoise(i, 4, 9) > 0.5 ? g.color(92, 165, 92, 16) : g.color(28, 90, 56, 18));
        g.ellipse(x, y, r * 1.4, r);
    }
    const blades = Math.min(9000, Math.floor(width * height / 160));
    for (let i = 0; i < blades; i++) {
        const x = sceneryNoise(i, 5, 7) * width;
        const y = sceneryNoise(i, 6, 7) * height;
        const light = sceneryNoise(i, 7, 7) > 0.5;
        g.fill(light ? g.color(130, 196, 120, 60) : g.color(20, 76, 48, 70));
        g.rect(x, y, 1.4, 3.2);
    }
}

function paintInfield(g) {
    if (currentInnerBoundary.length < 3) return;
    g.push();
    g.noStroke();
    g.fill(66, 146, 84);
    g.beginShape();
    for (const point of currentInnerBoundary) g.vertex(point[0], point[1]);
    g.endShape(CLOSE);

    const centerX = width / 2;
    const centerY = height / 2;
    if (isInsidePolygon(centerX, centerY, currentInnerBoundary)) {
        const w = Math.min(width, height) * 0.14;
        const h = Math.min(width, height) * 0.085;
        g.fill(210, 190, 140, 150);          // berge sableuse
        g.ellipse(centerX, centerY + 1, w * 1.22, h * 1.3);
        g.fill(58, 140, 176);                // eau
        g.ellipse(centerX, centerY, w, h);
        g.fill(124, 198, 220, 140);          // reflets
        g.ellipse(centerX - w * 0.12, centerY - h * 0.16, w * 0.55, h * 0.3);
        g.noFill();
        g.stroke(225, 244, 250, 120);
        g.strokeWeight(1.2);
        g.arc(centerX, centerY, w * 0.7, h * 0.65, 0.2, 1.7);
        g.noStroke();
    }

    for (const tree of currentLandscaping) paintTree(g, tree.x, tree.y, tree.size, sceneryNoise(tree.x, tree.y));
    g.pop();
}

function paintOuterScenery(g, canopy) {
    // Deux passes : les troncs, rochers et buissons d'abord, les couronnes des arbres après la piste
    // (elles débordent légèrement au-dessus du vibreur, ce qui donne de la profondeur).
    for (const item of currentScenery) {
        const isTall = item.kind === "tree" || item.kind === "pine";
        if (canopy !== isTall) continue;
        if (item.kind === "tree") paintTree(g, item.x, item.y, item.size, item.tone);
        else if (item.kind === "pine") paintPine(g, item.x, item.y, item.size, item.tone);
        else if (item.kind === "bush") paintBush(g, item.x, item.y, item.size, item.tone);
        else if (item.kind === "rock") paintRock(g, item.x, item.y, item.size, item.tone);
        else paintFlowers(g, item.x, item.y, item.size, item.tone);
    }
}

function paintTree(g, x, y, size, tone) {
    g.push();
    g.noStroke();
    g.fill(8, 30, 20, 70);
    g.ellipse(x + size * 0.28, y + size * 0.42, size * 1.5, size * 0.8);
    g.fill(104, 74, 50);
    g.rect(x - 1.6, y - 1, 3.2, size * 0.7, 1);
    const hue = tone > 0.5 ? [36, 126, 70] : [48, 140, 62];
    g.fill(hue[0] - 12, hue[1] - 30, hue[2] - 18);
    g.circle(x, y - size * 0.18, size * 1.08);
    g.fill(...hue);
    g.circle(x - size * 0.06, y - size * 0.25, size * 0.92);
    g.fill(hue[0] + 44, hue[1] + 46, hue[2] + 28, 210);
    g.circle(x - size * 0.2, y - size * 0.4, size * 0.48);
    g.pop();
}

function paintPine(g, x, y, size, tone) {
    g.push();
    g.noStroke();
    g.fill(8, 30, 20, 70);
    g.ellipse(x + size * 0.3, y + size * 0.4, size * 1.3, size * 0.7);
    g.fill(94, 66, 46);
    g.rect(x - 1.4, y, 2.8, size * 0.45, 1);
    const base = tone > 0.5 ? [22, 92, 62] : [30, 104, 66];
    for (let layer = 0; layer < 3; layer++) {
        const top = y - size * (0.95 - layer * 0.28);
        const half = size * (0.28 + layer * 0.16);
        g.fill(base[0] + layer * 8, base[1] + layer * 12, base[2] + layer * 6);
        g.triangle(x, top, x - half, top + size * 0.46, x + half, top + size * 0.46);
    }
    g.pop();
}

function paintBush(g, x, y, size, tone) {
    g.push();
    g.noStroke();
    g.fill(8, 30, 20, 60);
    g.ellipse(x + 2, y + size * 0.2, size * 1.2, size * 0.5);
    g.fill(34, 108, 60);
    g.circle(x - size * 0.2, y, size * 0.7);
    g.circle(x + size * 0.2, y, size * 0.7);
    g.fill(54, 138, 76);
    g.circle(x, y - size * 0.14, size * 0.72);
    if (tone > 0.65) {
        g.fill(242, 106, 120);
        g.circle(x - size * 0.12, y - size * 0.2, 2.6);
        g.circle(x + size * 0.16, y - size * 0.06, 2.6);
    }
    g.pop();
}

function paintRock(g, x, y, size, tone) {
    g.push();
    g.noStroke();
    g.fill(8, 30, 20, 60);
    g.ellipse(x + 2, y + size * 0.22, size * 0.95, size * 0.4);
    g.fill(122, 128, 132);
    g.ellipse(x, y, size * 0.8, size * 0.56);
    g.fill(162, 168, 170);
    g.ellipse(x - size * 0.1, y - size * 0.1, size * 0.4, size * 0.24);
    g.pop();
}

function paintFlowers(g, x, y, size, tone) {
    g.push();
    g.noStroke();
    const colors = [[255, 224, 96], [255, 255, 255], [255, 140, 170], [170, 150, 255]];
    for (let i = 0; i < 6; i++) {
        const dx = (sceneryNoise(x, y, i) - 0.5) * size * 1.4;
        const dy = (sceneryNoise(x, y, i + 9) - 0.5) * size * 0.9;
        const color = colors[Math.floor(sceneryNoise(i, tone * 10) * colors.length) % colors.length];
        g.fill(...color);
        g.circle(x + dx, y + dy, 3);
    }
    g.pop();
}

function paintRoadLine(g, color, weight, path = currentTrackPath) {
    g.push();
    g.noFill();
    g.stroke(color);
    g.strokeWeight(weight);
    g.strokeJoin(ROUND);
    g.strokeCap(ROUND);
    g.beginShape();
    for (const point of path) g.vertex(point[0], point[1]);
    g.endShape(CLOSE);
    g.pop();
}

function paintRoad(g) {
    // Ombre portée, zone de dégagement en gravier, puis asphalte.
    paintRoadLine(g, g.color(10, 40, 26, 70), TRACK_WIDTH + 58);
    paintRoadLine(g, "#c9b98a", TRACK_WIDTH + 40);
    paintRoadLine(g, "#d9cb9f", TRACK_WIDTH + 30);
    paintRoadLine(g, "#2b3133", TRACK_WIDTH + 4);
    paintRoadLine(g, "#434b4e", TRACK_WIDTH);
    paintRoadLine(g, g.color(52, 60, 64, 140), TRACK_WIDTH * 0.62);

    // Grain d'asphalte et traces de gomme
    g.push();
    g.noStroke();
    const half = TRACK_WIDTH / 2;
    for (let i = 0; i < currentTrackPath.length; i++) {
        const point = currentTrackPath[i];
        for (let k = 0; k < 14; k++) {
            const angle = sceneryNoise(i, k, 21) * Math.PI * 2;
            const radius = Math.sqrt(sceneryNoise(i, k, 22)) * half * 0.94;
            g.fill(sceneryNoise(i, k, 23) > 0.5 ? g.color(255, 255, 255, 14) : g.color(0, 0, 0, 30));
            g.rect(point[0] + Math.cos(angle) * radius, point[1] + Math.sin(angle) * radius, 1.6, 1.6);
        }
    }
    g.pop();

    // Lignes de bord blanches
    paintBoundaryLine(g, currentInnerBoundary, g.color(248, 246, 236, 190), 2, 4);
    paintBoundaryLine(g, currentOuterBoundary, g.color(248, 246, 236, 190), 2, 4);

    // Ligne centrale en tirets
    g.push();
    g.noFill();
    g.stroke(250, 236, 150, 215);
    g.strokeWeight(2.4);
    g.strokeCap(SQUARE);
    for (let i = 0; i < currentTrackPath.length; i += 3) {
        const a = currentTrackPath[i];
        const b = currentTrackPath[(i + 1) % currentTrackPath.length];
        g.line(a[0], a[1], b[0], b[1]);
    }
    g.pop();
}

// Ligne continue légèrement rentrée vers l'intérieur de la piste (vers la ligne centrale).
function paintBoundaryLine(g, boundary, color, weight, inset) {
    if (boundary.length < 2) return;
    g.push();
    g.noFill();
    g.stroke(color);
    g.strokeWeight(weight);
    g.strokeJoin(ROUND);
    g.beginShape();
    for (let i = 0; i < boundary.length; i++) {
        const c = currentTrackPath[i % currentTrackPath.length];
        const b = boundary[i];
        const dx = c[0] - b[0];
        const dy = c[1] - b[1];
        const length = Math.hypot(dx, dy) || 1;
        g.vertex(b[0] + dx / length * inset, b[1] + dy / length * inset);
    }
    g.endShape(CLOSE);
    g.pop();
}

// Vibreurs rouge et blanc le long des deux bords (là où se trouvent les murs de collision).
function paintKerbs(g) {
    g.push();
    g.strokeCap(SQUARE);
    for (const boundary of [currentInnerBoundary, currentOuterBoundary]) {
        for (let i = 0; i < boundary.length; i++) {
            const a = boundary[i];
            const b = boundary[(i + 1) % boundary.length];
            g.stroke(0, 0, 0, 55);
            g.strokeWeight(8);
            g.line(a[0] + 0.8, a[1] + 1.4, b[0] + 0.8, b[1] + 1.4);
            g.stroke(i % 2 === 0 ? "#f4efe4" : "#d2342c");
            g.strokeWeight(6);
            g.line(a[0], a[1], b[0], b[1]);
        }
    }
    g.pop();
}

function paintStartFinish(g) {
    if (!checkpoints.length || currentTrackPath.length < 3) return;
    const gate = checkpoints[0];
    const cross = p5.Vector.sub(gate.b, gate.a);
    const acrossLength = cross.mag();
    if (!acrossLength) return;
    cross.normalize();

    const center = p5.Vector.add(gate.a, gate.b).mult(0.5);
    const nearestIndex = currentTrackPath.reduce((best, point, index) => {
        const candidate = dist(point[0], point[1], center.x, center.y);
        return candidate < best.distance ? { index, distance: candidate } : best;
    }, { index: 0, distance: Infinity }).index;
    const before = currentTrackPath[(nearestIndex - 2 + currentTrackPath.length) % currentTrackPath.length];
    const after = currentTrackPath[(nearestIndex + 2) % currentTrackPath.length];
    const tangent = createVector(after[0] - before[0], after[1] - before[1]).normalize();
    const segmentCount = Math.max(4, Math.floor(acrossLength / 8));
    const segmentWidth = acrossLength / segmentCount;
    const rowDepth = 5;

    g.push();
    g.noStroke();
    // Damier sur deux rangées
    for (let row = 0; row < 2; row++) {
        for (let segment = 0; segment < segmentCount; segment++) {
            const start = p5.Vector.add(gate.a, cross.copy().mult(segment * segmentWidth));
            const end = p5.Vector.add(gate.a, cross.copy().mult((segment + 1) * segmentWidth));
            const front = (row - 1) * rowDepth;
            const back = row * rowDepth;
            g.fill((segment + row) % 2 === 0 ? "#f6f4ea" : "#14181a");
            g.beginShape();
            g.vertex(start.x + tangent.x * front, start.y + tangent.y * front);
            g.vertex(end.x + tangent.x * front, end.y + tangent.y * front);
            g.vertex(end.x + tangent.x * back, end.y + tangent.y * back);
            g.vertex(start.x + tangent.x * back, start.y + tangent.y * back);
            g.endShape(CLOSE);
        }
    }

    // Emplacements de grille derrière la ligne
    g.stroke(246, 244, 232, 120);
    g.strokeWeight(1.6);
    for (let slot = 0; slot < 3; slot++) {
        const offset = -(22 + slot * 26);
        for (const lane of [0.28, 0.72]) {
            const p = p5.Vector.add(gate.a, cross.copy().mult(acrossLength * lane));
            const cx = p.x + tangent.x * offset;
            const cy = p.y + tangent.y * offset;
            g.line(cx - cross.x * 9, cy - cross.y * 9, cx + cross.x * 9, cy + cross.y * 9);
            g.line(cx - cross.x * 9, cy - cross.y * 9, cx - cross.x * 9 - tangent.x * 8, cy - cross.y * 9 - tangent.y * 8);
            g.line(cx + cross.x * 9, cy + cross.y * 9, cx + cross.x * 9 - tangent.x * 8, cy + cross.y * 9 - tangent.y * 8);
        }
    }

    // Portique au-dessus de la ligne : deux poteaux et une poutre
    const left = p5.Vector.add(gate.a, cross.copy().mult(-9));
    const right = p5.Vector.add(gate.b, cross.copy().mult(9));
    g.noStroke();
    g.fill(0, 0, 0, 55);
    g.strokeCap(SQUARE);
    g.stroke(0, 0, 0, 55);
    g.strokeWeight(7);
    g.line(left.x + 3, left.y + 4, right.x + 3, right.y + 4);
    g.stroke("#2a3238");
    g.strokeWeight(6);
    g.line(left.x, left.y, right.x, right.y);
    g.stroke("#e23b36");
    g.strokeWeight(2);
    g.line(left.x, left.y, right.x, right.y);
    g.noStroke();
    g.fill("#1c2226");
    g.circle(left.x, left.y, 11);
    g.circle(right.x, right.y, 11);
    g.fill("#5b6770");
    g.circle(left.x - 1, left.y - 1, 6);
    g.circle(right.x - 1, right.y - 1, 6);
    g.pop();
}

// Assombrit doucement les bords de l'écran pour recentrer l'œil sur la piste.
function paintVignette(g) {
    const ctx = g.drawingContext;
    if (!ctx || typeof ctx.createRadialGradient !== "function") return;
    const radius = Math.hypot(width, height) / 2;
    const gradient = ctx.createRadialGradient(width / 2, height / 2, radius * 0.55, width / 2, height / 2, radius);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(5,20,14,0.38)");
    ctx.save();
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
}
