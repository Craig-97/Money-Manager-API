export const calculateAccountValues = account => {
  const { bankBalance, monthlyIncome } = account;
  const bankPaydayTotal = bankBalance + monthlyIncome;

  return Object.assign(account, { bankPaydayTotal });
};
