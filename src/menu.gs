/**
 * Menu "RMA Pipeline" exibido ao abrir a planilha.
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('RMA Pipeline')
    .addItem('Processar arquivos de entrada', 'scanEntrada')
    .addItem('Extrair e estruturar dados', 'extrairConteudoArquivosPendentes')
    .addItem('Extrair (todos exceto processados)', 'extrairConteudoNaoProcessado')
    .addSeparator()
    // Relatórios de balancete e DRE são gerados via o relatório individual ou de grupo
    .addItem('Relatório Individual (linha selecionada)', 'exportarRelatorioIndividualDaLinha')
    .addItem('Relatório de Grupo (linha selecionada)', 'exportarRelatorioGrupoDaLinha')
    .addSeparator()
    .addItem('Calcular percentuais DRE/Balanço', 'calcularPercentuaisDreEBalanco')
    .addItem('Gerar Indicadores (linha selecionada)', 'gerarIndicadoresDaLinha')
    .addItem('Gerar Indicadores pendentes (empresas)', 'gerarIndicadoresPendentes')
    .addItem('Gerar Indicadores de grupos (linha selecionada)', 'gerarIndicadoresGrupoDaLinha')
    .addItem('Gerar Indicadores de grupos pendentes', 'gerarIndicadoresGruposPendentes')
    .addSeparator()
    .addItem('Gerenciar grupos', 'gerenciarGrupos')
    .addItem('Sanear empresas nas bases', 'sanearEmpresasNasBases')
    .addItem('Sanear empresas (BalancoBase/DreBase)', 'sanearEmpresasBalancoEDre')
    .addItem('Corrigir id da DRE sintetica', 'corrigirVinculoIdDreSemId')
    .addItem('Painel de Gráficos (Indicadores)', 'abrirPainelIndicadores')
    .addSeparator()
    .addItem('Limpar propriedades do script', 'limparPropriedadesScript')
    .addItem('Configurar planilha (instalação)', 'configurarPlanilha')
    .addToUi();
}
