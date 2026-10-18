/**
 * Calcule la distance entre un point p et un segment [a, b].
 * Utilise la projection vectorielle pour trouver le point le plus proche sur le segment.
 */
function distPointToSegment(p, a, b) {
    let pa = p5.Vector.sub(p, a);
    let ba = p5.Vector.sub(b, a);
    if (ba.magSq() === 0) return pa.mag(); // segment réduit à un point
    let h = constrain(pa.dot(ba) / ba.magSq(), 0, 1);
    return pa.sub(ba.mult(h)).mag();
}

/**
 * Distance minimale entre deux segments [p1, p2] et [q1, q2].
 * Vaut 0 si les segments se croisent. Sert à la collision « balayée » :
 * on teste le trajet parcouru pendant un pas, pas seulement la position finale.
 */
function distSegmentToSegment(p1, p2, q1, q2) {
    const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
    const d2x = q2.x - q1.x, d2y = q2.y - q1.y;
    const den = d1x * d2y - d1y * d2x;
    if (den !== 0) {
        const t = ((q1.x - p1.x) * d2y - (q1.y - p1.y) * d2x) / den;
        const u = ((q1.x - p1.x) * d1y - (q1.y - p1.y) * d1x) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
    }
    return Math.min(
        distPointToSegment(p1, q1, q2),
        distPointToSegment(p2, q1, q2),
        distPointToSegment(q1, p1, p2),
        distPointToSegment(q2, p1, p2)
    );
}

/**
 * Un segment [a, b] touche-t-il un rectangle orienté ?
 * Le rectangle est centré en `center`, sa longueur (2 × halfLength) suit `heading`,
 * sa largeur vaut 2 × halfWidth. On ramène le segment dans le repère du rectangle,
 * puis on le coupe contre la boîte alignée (méthode de Liang-Barsky).
 */
function segmentHitsOrientedRect(a, b, center, heading, halfLength, halfWidth) {
    const cos = Math.cos(heading);
    const sin = Math.sin(heading);
    const toLocal = point => {
        const dx = point.x - center.x;
        const dy = point.y - center.y;
        return [dx * cos + dy * sin, -dx * sin + dy * cos];
    };
    const [x0, y0] = toLocal(a);
    const [x1, y1] = toLocal(b);
    const dx = x1 - x0;
    const dy = y1 - y0;
    let tMin = 0;
    let tMax = 1;
    const clip = (p, q) => {
        if (p === 0) return q >= 0;
        const t = q / p;
        if (p < 0) { if (t > tMax) return false; if (t > tMin) tMin = t; }
        else { if (t < tMin) return false; if (t < tMax) tMax = t; }
        return true;
    };
    return clip(-dx, x0 + halfLength) && clip(dx, halfLength - x0) &&
        clip(-dy, y0 + halfWidth) && clip(dy, halfWidth - y0);
}

/**
 * Fonction gaussienne aléatoire (approximation Box-Muller ou simple somme).
 * p5.js a randomGaussian(), mais au cas où ou pour contrôle précis.
 */
// p5.js fournit déjà randomGaussian(mean, sd)
