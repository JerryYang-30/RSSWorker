import { renderRss2 } from '../../utils/util';

let getUser = async (url) => {
	let res = await fetch(url, {
		headers: {
			"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
		}
	});
	let scripts = [];
	let rewriter = new HTMLRewriter()
		.on('script', {
			element(element) {
				scripts.push('');
			},
			text(text) {
				scripts[scripts.length - 1] += text.text;
			},
		})
		.transform(res);
	await rewriter.text();
	let script = scripts.find((script) => script.startsWith('window.__INITIAL_STATE__='));
	script = script.slice('window.__INITIAL_STATE__='.length);
	// replace undefined to null
	script = script.replace(/undefined/g, 'null');
	let state = JSON.parse(script);
	return state.user;
};

let deal = async (ctx) => {
	// const uid = ctx.params.user_id;
	// const category = ctx.params.category;
	const { uid } = ctx.req.param();
	const category = 'notes';
	const url = `https://www.xiaohongshu.com/user/profile/${uid}`;

	const {
		userPageData: { basicInfo, interactions, tags },
		notes,
		collect,
	} = await getUser(url);

	const title = `${basicInfo.nickname} - ${category === 'notes' ? '笔记' : '收藏'} • 小红书 / RED`;
	const description = `${basicInfo.desc} ${tags.map((t) => t.name).join(' ')} ${interactions.map((i) => `${i.count} ${i.name}`).join(' ')}`;
	const image = basicInfo.imageb || basicInfo.images;

	const renderNote = (notes) =>
		notes.flatMap((n) =>
			n.map(({ noteCard }) => ({
				// Qi Reader用Id判断文章是否重复
				guid: noteCard.cover.infoList.pop().url, // 使用封面链接作为ID,
				title: noteCard.displayTitle,
				// 现在必须要登陆才能获取笔记链接，所以文章link都是{url}了（noteId为空）。
				// 而Qi Reader把文章链接当作文章Id（如果源里没有Id字段的话），所以所有文章共用一个链接就导致了新文章被判定重复。
				// link: `${url}/${noteCard.noteId}`,
				link: `${noteCard.cover.infoList.pop().url}`,
				description: `<img src ="${noteCard.cover.infoList.pop().url}"><br>${noteCard.displayTitle}`,
				author: noteCard.user.nickname,
				upvotes: noteCard.interactInfo.likedCount,
			}))
		);
	const renderCollect = (collect) => {
		if (!collect) {
			throw Error('该用户已设置收藏内容不可见');
		}
		if (collect.code !== 0) {
			throw Error(JSON.stringify(collect));
		}
		if (!collect.data.notes.length) {
			throw ctx.throw(403, '该用户已设置收藏内容不可见');
		}
		return collect.data.notes.map((item) => ({
			title: item.display_title,
			link: `${url}/${item.note_id}`,
			description: `<img src ="${item.cover.info_list.pop().url}"><br>${item.display_title}`,
			author: item.user.nickname,
			upvotes: item.interact_info.likedCount,
		}));
	};

    ctx.header('Content-Type', 'application/xml');
	return ctx.text(
		renderRss2({
			title,
			description,
			image,
			link: url,
			items: category === 'notes' ? renderNote(notes) : renderCollect(collect),
		})
	);
};

let setup = (route) => {
	route.get('/xiaohongshu/user/:uid', deal);
};

export default { setup };
