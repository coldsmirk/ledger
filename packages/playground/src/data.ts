/**
 * Deterministic fake data — a seeded LCG so every reload shows the same rows.
 */

export interface Person {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "invited" | "suspended";
  age: number;
  balance: number;
  joinedAt: string;
}

export interface Region {
  id: string;
  name: string;
  revenue: number;
  children?: Region[];
}

const FIRST_NAMES = ["林", "陈", "黄", "张", "李", "王", "吴", "刘", "蔡", "杨", "许", "郑", "谢", "郭", "洪"];
const LAST_NAMES = ["伟", "芳", "娜", "敏", "静", "磊", "军", "洋", "勇", "艳", "杰", "涛", "明", "超", "秀兰"];
const ROLES = ["工程师", "设计师", "产品经理", "运营", "测试"];
const STATUSES: Array<Person["status"]> = ["active", "invited", "suspended"];

function makeRng(seed: number) {
  let state = seed;

  return () => {
    state = (state * 48_271) % 2_147_483_647;

    return state / 2_147_483_647;
  };
}

function pick<T>(rng: () => number, items: T[]): T {
  const item = items[Math.floor(rng() * items.length)];

  if (item === undefined) {
    throw new Error("empty pool");
  }

  return item;
}

export function makePeople(count: number, seed = 7): Person[] {
  const rng = makeRng(seed);

  return Array.from({ length: count }, (_, index) => {
    const name = `${pick(rng, FIRST_NAMES)}${pick(rng, LAST_NAMES)}`;

    return {
      id: `p-${index + 1}`,
      name,
      email: `user${index + 1}@example.com`,
      role: pick(rng, ROLES),
      status: pick(rng, STATUSES),
      age: 22 + Math.floor(rng() * 40),
      balance: Math.round(rng() * 100_000) / 100,
      joinedAt: isoDate(rng)
    };
  });
}

function isoDate(rng: () => number): string {
  const month = Math.floor(rng() * 36);
  const day = 1 + Math.floor(rng() * 28);

  return new Date(Date.UTC(2023, month, day)).toISOString().slice(0, 10);
}

export function makeRegions(): Region[] {
  const rng = makeRng(11);
  let counter = 0;

  const region = (name: string, depth: number): Region => {
    counter += 1;

    const node: Region = {
      id: `r-${counter}`,
      name,
      revenue: Math.round(rng() * 90_000 + 10_000)
    };

    if (depth < 2) {
      const childCount = 2 + Math.floor(rng() * 2);
      const children: Region[] = [];

      for (let index = 0; index < childCount; index += 1) {
        children.push(region(`${name}-${index + 1} 区`, depth + 1));
      }

      node.children = children;
    }

    return node;
  };

  return [region("华东", 0), region("华南", 0), region("华北", 0)];
}
