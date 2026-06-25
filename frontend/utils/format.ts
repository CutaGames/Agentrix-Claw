export const formatDateTime = (date: string | Date) => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatCurrency = (amount: number, currency: string = 'USD') => {
  const upperCurrency = currency.toUpperCase();
  if (upperCurrency === 'USDT' || upperCurrency === 'USDC') {
    return `${upperCurrency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: upperCurrency,
    }).format(amount);
  } catch (e) {
    return `${upperCurrency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
};
