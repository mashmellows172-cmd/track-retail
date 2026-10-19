import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { Venta } from '@/types/venta';

// Solo columnas necesarias — evita traer datos extras de Supabase
const VENTAS_SELECT = 'id,folio,fecha_compra,canal,valor_garantia,comision_calculada,tipo_garantia,anos_garantia,precio_producto,total_boleta,numero_pedido,vendedor_id';

export async function POST(req: NextRequest) {
  try {
    const data = (await req.json()) as Venta;

    if (!data.folio || !data.fecha_compra || !data.canal || !data.vendedor_id) {
      return NextResponse.json({ error: 'Faltan campos obligatorios: folio, fecha_compra, canal, vendedor_id' }, { status: 400 });
    }

    const { data: insertedData, error } = await supabase
      .from('ventas')
      .insert([{
        folio: data.folio,
        fecha_compra: data.fecha_compra,
        canal: data.canal,
        precio_producto: data.precio_producto ?? 0,
        cantidad_unidades: data.cantidad_unidades ?? 1,
        valor_garantia: data.valor_garantia ?? 0,
        anos_garantia: data.anos_garantia ?? 1,
        tipo_garantia: data.tipo_garantia ?? 'lineas_duras',
        total_boleta: data.total_boleta ?? 0,
        numero_pedido: data.numero_pedido ?? null,
        vendedor_id: data.vendedor_id,
      }])
      .select(VENTAS_SELECT)
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Esta boleta ya fue ingresada (folio duplicado)' }, { status: 409 });
      }
      console.error('Supabase insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(insertedData);

  } catch (error: unknown) {
    console.error('Error en POST /api/ventas:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const vendedor_id = searchParams.get('vendedor_id');
    const mes = searchParams.get('mes');

    if (!vendedor_id) {
      return NextResponse.json({ error: 'Se requiere vendedor_id' }, { status: 400 });
    }

    let query = supabase
      .from('ventas')
      .select(VENTAS_SELECT)
      .eq('vendedor_id', vendedor_id)
      .order('fecha_compra', { ascending: false });

    if (mes) {
      const [year, month] = mes.split('-').map(Number);
      const startDate = `${mes}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];
      query = query.gte('fecha_compra', startDate).lte('fecha_compra', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase GET error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Cache corto: 15s en el navegador, 30s en CDN — datos casi en tiempo real
    return NextResponse.json(data ?? [], {
      headers: {
        'Cache-Control': 's-maxage=30, stale-while-revalidate=60',
      },
    });

  } catch (error: unknown) {
    console.error('Error en GET /api/ventas:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}

