class Ray {
    constructor(pos, angle) {
        this.pos = pos || createVector(0, 0);
        this.dir = p5.Vector.fromAngle(angle || 0);
    }

    setPos(x, y) {
        this.pos.x = x;
        this.pos.y = y;
    }

    setDir(angle) {
        this.dir = p5.Vector.fromAngle(angle);
    }

    cast(wall) {
        const x1 = wall.a.x;
        const y1 = wall.a.y;
        const x2 = wall.b.x;
        const y2 = wall.b.y;

        const x3 = this.pos.x;
        const y3 = this.pos.y;
        const x4 = this.pos.x + this.dir.x;
        const y4 = this.pos.y + this.dir.y;

        const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (den == 0) {
            return;
        }

        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;

        if (t > 0 && t < 1 && u > 0) {
            const pt = createVector();
            pt.x = x1 + t * (x2 - x1);
            pt.y = y1 + t * (y2 - y1);
            return pt;
        } else {
            return;
        }
    }

    show(distance = SIGHT_DIST, color = [255, 220, 70, 170]) {
        push();
        stroke(...color);
        strokeWeight(1);
        const end = this.end || p5.Vector.add(
            this.pos,
            this.dir.copy().mult(distance)
        );
        line(this.pos.x, this.pos.y, end.x, end.y);
        if (this.end) {
            noStroke();
            fill(...color);
            circle(this.end.x, this.end.y, 5);
        }
        noStroke();
        fill(255, 244, 180);
        textSize(9);
        textAlign(CENTER, CENTER);
        const labelX = (this.pos.x + end.x) / 2;
        const labelY = (this.pos.y + end.y) / 2;
        text(`${Math.round(this.distance)} px`, labelX, labelY);
        pop();
    }
}
