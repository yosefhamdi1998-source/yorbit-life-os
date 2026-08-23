import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const BILL_IDS = ["6a4702ac8636405d11546f82","6a4702ac8636405d11546f83","6a4702ac8636405d11546f84","6a4702ac8636405d11546f85","6a4702ac8636405d11546f86","6a4702ac8636405d11546f87","6a4702ac8636405d11546f88","6a31c774ca755d3ac9b5fcd3","6a31c7bc45822d10838eef50","6a31c7ca866350e57c64fe40","6a31c98e058df1a980ba5e52","6a31c99bfacc4e14fc1e43c4","6a38ffc5a4a3655df6d6d047","6a38ffccc1b1b9bd1e9a4083","6a38ffcf56f9cf9b7074e28b","6a38ffcffc8ec7baedf02f8e","6a38ffcfe93a6df3b7c9f619","6a38ffd04d0a6e38df18a913","6a38ffd2af70ba9358770365","6a38ffd2763dd2a04545556a","6a38ffeeaa6b305fa7318030","6a38fff0377e57f33dd6d852","6a38fff0b313a380f517cb39","6a38fff03a49136dd53c072e","6a38fff287d0c64fa14075fd","6a38fff2e15062ba5e08ba3d","6a38fff3d3fb233fe070618d","6a38fff38ffdc79dd8809b9a","6a38fff351fe696eed87a35f","6a38fff8ca2d7ff91df67707","6a38fff8a7c357fef3a9ce9b","6a38fffae21de69a5cd8b1c9","6a39002178b88e0c8726b51e","6a39006d8a5342d6d47361a5"];

const BUDGET_IDS = ["6a4702ac8636405d11546f89","6a4702ac8636405d11546f8a","6a4702ac8636405d11546f8b","6a4702ac8636405d11546f8c","6a4702ac8636405d11546f8d","6a4702ac8636405d11546f8e","6a4702ac8636405d11546f8f","6a4702ac8636405d11546f90","6a4702ac8636405d11546f91","6a4702ac8636405d11546f92","6a4702ac8636405d11546f93","6a4702ac8636405d11546f94","6a3900b6e4b640e2ca0a510f"];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const errors = [];
    let bills_deleted = 0;
    let budgets_deleted = 0;

    for (const id of BILL_IDS) {
      try {
        await base44.asServiceRole.entities.Bill.delete(id);
        bills_deleted++;
      } catch (err) {
        errors.push({ entity: 'Bill', id, error: err.message });
      }
    }

    for (const id of BUDGET_IDS) {
      try {
        await base44.asServiceRole.entities.Budget.delete(id);
        budgets_deleted++;
      } catch (err) {
        errors.push({ entity: 'Budget', id, error: err.message });
      }
    }

    return Response.json({ bills_deleted, budgets_deleted, errors });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});