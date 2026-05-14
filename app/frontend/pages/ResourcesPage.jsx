import React from 'react';
import { Link } from 'react-router-dom';

const guides = [
  {
    title: 'Bat dau voi Wizard',
    body: 'Tra loi Wizard de he thong hieu hoc luc, so thich, muc tieu nghe nghiep va uu tien nganh hoc cua ban.',
    action: 'Mo Wizard',
    href: '/wizard'
  },
  {
    title: 'Quan ly Profile va CV',
    body: 'Cap nhat thong tin ca nhan, xem lai file CV PDF da tai len, va chay lai Wizard khi muon thay doi cau tra loi.',
    action: 'Mo Profile',
    href: '/profile'
  },
  {
    title: 'Hoi Tu van AI',
    body: 'Dung trang Tu van AI de hoi ve nganh hoc, yeu cau tuyen sinh, hoc bong, deadlines va cac buoc nop ho so.',
    action: 'Mo Tu van AI',
    href: '/consultant'
  },
  {
    title: 'Xem Report',
    body: 'Report tong hop ket qua matching, goi y nganh phu hop, diem can cai thien va buoc tiep theo cho ho so.',
    action: 'Mo Report',
    href: '/report'
  }
];

const ResourcesPage = () => {
  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-50/50">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="border-b-4 border-primary pb-4">
          <h1 className="text-3xl font-black text-primary tracking-tight">Tai nguyen</h1>
          <p className="text-slate-500 font-medium mt-1">
            Huong dan ngan gon de hoc sinh biet nen dung tinh nang nao trong tung buoc chuan bi ho so.
          </p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {guides.map((guide) => (
            <article key={guide.title} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
              <h2 className="text-lg font-black text-slate-900">{guide.title}</h2>
              <p className="text-sm text-slate-600 mt-2 leading-6">{guide.body}</p>
              <Link
                to={guide.href}
                className="inline-flex mt-5 px-4 py-2.5 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest"
              >
                {guide.action}
              </Link>
            </article>
          ))}
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Quy trinh de xuat</h2>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
            {['Hoan thanh Wizard', 'Tai CV PDF', 'Hoi AI khi can giai thich', 'Doc Report va cap nhat Profile'].map((step, index) => (
              <div key={step} className="border border-slate-100 bg-slate-50 rounded-xl p-4">
                <p className="text-[10px] font-black text-primary uppercase tracking-widest">Buoc {index + 1}</p>
                <p className="text-sm font-bold text-slate-800 mt-2">{step}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ResourcesPage;
