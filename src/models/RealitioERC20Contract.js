import _ from "lodash";
import moment from "moment";

import { realitio } from "../interfaces";
import Numbers from "../utils/Numbers";
import IContract from './IContract';

/**
 * RealitioERC20 Contract Object
 * @constructor RealitioERC20Contract
 * @param {Web3} web3
 * @param {Integer} decimals
 * @param {Address} contractAddress
 */

class RealitioERC20Contract extends IContract {
	constructor(params) {
		super({abi: realitio, ...params});
	}

	/**
	 * @function getQuestion
	 * @description getQuestion
   * @param {bytes32} questionId
	 * @returns {Object} question
	 */
	async getQuestion({ questionId }) {
		const question = await this.getContract().methods.questions(questionId).call();
		const isFinalized = await this.getContract().methods.isFinalized(questionId).call();
		const isClaimed = isFinalized && question.history_hash === Numbers.nullHash();

		return {
			id: questionId,
			bond: Numbers.fromDecimalsNumber(question.bond, 18),
			bestAnswer: question.best_answer,
			finalizeTs: question.finalize_ts,
			isFinalized,
			isClaimed
		};
	}

	/**
	 * @function getQuestionBestAnswer
	 * @description getQuestionBestAnswer
   * @param {bytes32} questionId
	 * @returns {bytes32} answerId
	 */
	async getQuestionBestAnswer({ questionId }) {
		return await this.getContract().methods.getBestAnswer(questionId).call();
	}

	/**
	 * @function resultForQuestion
	 * @description resultForQuestion - throws an error if question is not finalized
   * @param {bytes32} questionId
	 * @returns {bytes32} answerId
	 */
	async getResultForQuestion({ questionId }) {
		return await this.getContract().methods.resultFor(questionId).call();
	}

	/**
	 * @function getQuestionBondsByAnswer
	 * @description getQuestionBondsByAnswer - throws an error if question is not finalized
   * @param {bytes32} questionId
	 * @returns {Object} bonds
	 */
	async getQuestionBondsByAnswer({ questionId, user }) {
		const bonds = {};

		const answers = await this.getContract().getPastEvents('LogNewAnswer', {
			fromBlock: 0,
			toBlock: 'latest',
			filter: { question_id: questionId, user }
		});

		answers.forEach((answer) => {
			const answerId = answer.returnValues.answer;

			if (!bonds[answerId]) bonds[answerId] = 0;

			bonds[answerId] += Numbers.fromDecimalsNumber(answer.returnValues.bond, 18);
		});

		return bonds;
	}

	/**
	 * @function submitAnswerERC20
	 * @description Submit Answer for a Question
	 * @param {bytes32} questionId
	 * @param {bytes32} answerId
	 * @param {Integer} amount
	 */
	submitAnswerERC20 = async({ questionId, answerId, amount }) => {
		let amountDecimals = Numbers.toSmartContractDecimals(amount, 18);

		return await this.__sendTx(
			this.getContract().methods.submitAnswerERC20(
        questionId,
        answerId,
        0,
        amountDecimals
      ),
			false
		);
  }

	/**
	 * @function getMyBonds
	 * @description Get My Bonds
	 * @returns {Array} Outcome Shares
	 */
	 async getMyBonds() {
		const account = await this.getMyAccount();
		if (!account) return {};

		const events = await this.getContract().getPastEvents(
			'LogNewAnswer',
			{
				fromBlock: 0,
				toBlock: 'latest',
				filter: { user: account }
			}
		);

		const bonds = {};

		// iterating through every answer and summing up the bonds
		events.forEach((event) => {
			const questionId = event.returnValues.question_id;

			// initializing bond vars
			if (!bonds[questionId]) bonds[questionId] = { total: 0, answers: {} };
			if (!bonds[questionId].answers[event.returnValues.answer]) {
				bonds[questionId].answers[event.returnValues.answer] = 0;
			}

			const bond = Numbers.fromDecimalsNumber(event.returnValues.bond, 18)

			bonds[questionId].total += bond;
			bonds[questionId].answers[event.returnValues.answer] += bond;
		});

		return bonds;
	}

	/**
	 * @function claimWinnings
	 * @description claimWinnings
	 * @param {bytes32} questionId
	 */
	 async claimWinnings(questionId) {
		const question = await this.getQuestion({ questionId });

		// assuring question state is finalized and not claimed
		if (question.isClaimed || !question.isFinalized) return false;

		const events = await this.getContract().getPastEvents(
			'LogNewAnswer',
			{
				fromBlock: 0,
				toBlock: 'latest',
				filter: { question_id: questionId }
			}
		);

		const historyHashes = events.map((event) => event.returnValues.history_hash).slice(0, -1).reverse();
		// adding an empty hash to the history hashes
		historyHashes.push(Numbers.nullHash());

		const addrs = events.map((event) => event.returnValues.user).reverse();
		const bonds = events.map((event) => event.returnValues.bond).reverse();
		const answers = events.map((event) => event.returnValues.answer).reverse();

		return await this.__sendTx(
			this.getContract().methods.claimWinnings(
        questionId,
				// [historyHashes.length],
				historyHashes,
				addrs,
				bonds,
				answers
      ),
			false
		);
	}
}

export default RealitioERC20Contract;